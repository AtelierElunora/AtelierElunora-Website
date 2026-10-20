import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
async function moduleAt(path){const b=await build({entryPoints:[path],bundle:true,platform:"node",format:"esm",write:false});return import("data:text/javascript;base64,"+Buffer.from(b.outputFiles[0].text).toString("base64"))}
const {refreshContract,applyContractSignature,applyProviderSignature}=await moduleAt("app/booking-contract.server.ts");
const {contractReadyForPayment,contractPrintHtml}=await moduleAt("app/booking-contract.ts");
const {eventAgreementSettings,validateAgreementSettings,readAgreementFields}=await moduleAt("app/event-agreement.ts");
const profile=()=>({enabled:true,providerLegalName:"Example Studio LLC",providerAddress:"1 Example Lane, Example OH 44000",providerEmail:"studio@example.invalid",providerPhone:"+1 555 0100",backupDeletionPeriod:"No photo backups retained in this sample.",additionalHourAddonId:"extra-hour"});
const booking=()=>({id:"sample",customerName:"Alex & Jordan",customerEmail:"couple@example.invalid",venue:"Example venue",weddingDate:"2030-07-24",totalCents:174500,balanceDueDate:"2030-06-24"});
const details=()=>({currency:"USD",prepaymentPercent:30,phone:"+15555550101",preferredStartTime:"5:00 PM",guests:150,package:{name:"Up to 150 guests",priceCents:149500},addons:[{id:"extra-hour",name:"Additional event hour",qty:1,priceCents:25000}],agreement:{text:"Full agreement",version:1,signatureRequired:true,preparedAt:"2026-10-20T12:00:00Z",eventTemplate:profile(),fields:{mailingAddress:"2 Sample Lane"}}});
function form(c,extra={}){const f=new FormData();for(const [k,v]of Object.entries({contractHash:c.hash,signatureName:"Alex Example",signatureConsent:"yes",signatureStyle:"script",...extra}))f.set(k,v);return f}
test("full agreement retains all 20 sections and fills selected booking data without template blanks",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d),a=c.document.serviceAgreement;
 assert.equal(a.sections.length,20);assert.equal(a.missingFields.length,0);
 assert.match(c.document.termsText,/Example Studio LLC/);assert.match(c.document.termsText,/2 Sample Lane/);
 assert.match(c.document.termsText,/Booked live service: 5 hours/);assert.match(c.document.termsText,/\$523.50/);
 assert.match(c.document.termsText,/\$1,221\.50/);assert.match(c.document.termsText,/20 Notices complete agreement/);
 assert.doesNotMatch(c.document.termsText,/\[[^\]]*\]|\{\{/);
 assert.equal(refreshContract(b,d).hash,c.hash);
});
test("incomplete business settings or missing client fields cannot be signed",()=>{
 assert.throws(()=>validateAgreementSettings(eventAgreementSettings({enabled:true})),/Complete/);
 const b=booking(),d=details();d.agreement.eventTemplate.backupDeletionPeriod="";delete d.agreement.fields.mailingAddress;
 const c=refreshContract(b,d);assert.throws(()=>applyContractSignature(b,d,form(c)),/owner review/);assert.equal(c.signature,null);
});
test("generated signature is explicit, records the chosen style, and needs a separate provider signature",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d);
 assert.throws(()=>applyContractSignature(b,d,form(c,{signatureConsent:""})),/consent/);
 assert.throws(()=>applyContractSignature(b,d,form(c,{signatureStyle:"javascript"})),/supported/);
 applyContractSignature(b,d,form(c));assert.equal(c.signature.style,"script");assert.equal(contractReadyForPayment(c),false);
 const provider=form(c,{providerName:"Studio Owner",providerTitle:"Owner",providerConsent:"yes"});
 applyProviderSignature(b,d,provider,new Date("2026-10-20T13:00:00Z"));assert.equal(contractReadyForPayment(c),true);
 assert.equal(applyProviderSignature(b,d,provider).alreadySigned,true);
 assert.throws(()=>applyContractSignature(b,d,form(c,{signatureStyle:"classic"})),/already/);
});
test("material amendments preserve both receipts and require both parties to sign the revised copy",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d);applyContractSignature(b,d,form(c));
 applyProviderSignature(b,d,form(c,{providerName:"Studio Owner",providerTitle:"Owner",providerConsent:"yes"}));
 b.venue="A different venue";const amended=refreshContract(b,d);
 assert.equal(amended.signature,null);assert.equal(amended.providerSignature,undefined);assert.equal(d.agreement.contractHistory[0].providerSignature.name,"Studio Owner");
 assert.equal(contractReadyForPayment(amended),false);assert.throws(()=>applyContractSignature(b,d,form(c)),/changed/);
});
test("printed full agreements contain all sections and safely escape names, terms and receipts",()=>{
 const b=booking(),d=details();b.customerName="<script>alert(1)</script>";d.agreement.fields.specialTerms='<img src=x onerror=alert(1)>';
 const c=refreshContract(b,d);applyContractSignature(b,d,form(c));applyProviderSignature(b,d,form(c,{providerName:"Studio Owner",providerTitle:"Owner",providerConsent:"yes"}));
 const html=contractPrintHtml(c);assert.match(html,/20 Notices/);assert.match(html,/Client signature/);assert.match(html,/Provider signature/);assert.match(html,/Studio Owner/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|<img|portalHash/);
});
test("customer agreement input cannot set owner-only terms or business identity",()=>{
 const f=readAgreementFields({mailingAddress:"2 Sample Lane",specialTerms:"waive all payment",providerAddress:"attacker"});
 assert.equal(f.mailingAddress,"2 Sample Lane");assert.equal(f.specialTerms,undefined);assert.equal(f.providerAddress,undefined);
});

test("saved rendered contracts are retained until a relevant booking input changes",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d);applyContractSignature(b,d,form(c));
 const original=JSON.stringify(c);d.unrelatedOwnerSetting="new value";
 assert.equal(JSON.stringify(refreshContract(b,d)),original);
 d.agreement.fields.serviceEnd="11:00 PM";assert.notEqual(refreshContract(b,d).hash,c.hash);
 assert.equal(d.agreement.contractHistory[0].hash,c.hash);
});
