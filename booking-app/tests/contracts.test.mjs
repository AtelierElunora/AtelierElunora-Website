import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
const compiled=await build({entryPoints:["app/booking-contract.server.ts"],bundle:true,platform:"node",format:"esm",write:false});
const {currentContract,refreshContract,applyContractSignature,contractHash}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const shared=await build({entryPoints:["app/booking-contract.ts"],bundle:true,platform:"node",format:"esm",write:false});
const {contractPlainText,contractPrintHtml,SIGNATURE_CONSENT}=await import("data:text/javascript;base64,"+Buffer.from(shared.outputFiles[0].text).toString("base64"));
const booking=()=>({id:"test-booking",customerName:"Alex & Jordan",customerEmail:"couple@example.invalid",venue:"Example venue, 1 Example Lane",weddingDate:"2028-07-24",totalCents:149500,balanceDueDate:"2028-06-24"});
const details=()=>({currency:"USD",prepaymentPercent:30,guests:150,phone:"+15555550100",preferredStartTime:"5:00 PM",package:{name:"Up to 150 guests"},addons:[],customerNotes:"Garden reception",agreement:{text:"Owner's existing booking and cancellation terms.",version:3,acceptedAt:null,signatureRequired:true},portalHash:"DO-NOT-PRINT-TOKEN"});
function form(c,name="Alex Example",consent=true){const f=new FormData();f.set("contractHash",c.hash);f.set("signatureName",name);if(consent)f.set("signatureConsent","yes");return f}
test("personalizes the saved terms with server booking fields and exact 30/70 amounts",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d);assert.equal(c.document.customerName,b.customerName);assert.equal(c.document.venue,b.venue);assert.equal(c.document.prepaymentCents,44850);assert.equal(c.document.balanceCents,104650);assert.equal(c.document.termsText,d.agreement.text);assert.equal(c.document.termsVersion,3);assert.equal(c.hash,contractHash(c.document));assert.doesNotMatch(contractPlainText(c),/DO-NOT-PRINT-TOKEN/);
});
test("requires an explicit typed name, consent and the exact reviewed contract hash",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d);assert.throws(()=>applyContractSignature(b,d,form(c,"")),/full name/);assert.throws(()=>applyContractSignature(b,d,form(c,"Alex Example",false)),/consent/);
 const stale=form(c);b.totalCents+=100;assert.throws(()=>applyContractSignature(b,d,stale),/changed/);assert.equal(d.agreement.contract.signature,null);
});
test("saves the timestamp, verified booking email and document hash without changing payment",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d),f=form(c);f.set("customerEmail","attacker@example.invalid");const now=new Date("2026-10-20T12:00:00Z");
 const result=applyContractSignature(b,d,f,"sample browser",now);assert.equal(result.contract.signature.email,"couple@example.invalid");assert.equal(result.contract.signature.signedAt,now.toISOString());assert.equal(result.contract.signature.documentHash,c.hash);assert.equal(result.contract.signature.consent,SIGNATURE_CONSENT);assert.equal(d.agreement.acceptedAt,now.toISOString());assert.equal(b.totalCents,149500);
});
test("duplicate signatures preserve the original record and cannot replace the signer",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d),f=form(c);applyContractSignature(b,d,f,"",new Date("2026-10-20T12:00:00Z"));const first=JSON.stringify(d.agreement.contract);assert.equal(applyContractSignature(b,d,f).alreadySigned,true);assert.equal(JSON.stringify(d.agreement.contract),first);assert.throws(()=>applyContractSignature(b,d,form(c,"Someone Else")),/already/);
});
test("approved material changes retain the signed original and require a new signature",()=>{
 const b=booking(),d=details(),c=refreshContract(b,d);applyContractSignature(b,d,form(c));const signed=structuredClone(d.agreement.contract);b.weddingDate="2028-07-25";const next=refreshContract(b,d);assert.equal(next.revision,2);assert.equal(next.signature,null);assert.equal(d.agreement.acceptedAt,null);assert.deepEqual(d.agreement.contractHistory,[signed]);refreshContract(b,d);assert.equal(d.agreement.contractHistory.length,1);assert.notEqual(next.hash,signed.hash);
});
test("legacy checkbox acceptance is never presented as an electronic signature",()=>{
 const b=booking(),d=details();d.agreement.acceptedAt="2026-01-01T00:00:00Z";d.agreement.signatureRequired=false;const c=refreshContract(b,d);assert.equal(c.signature,null);assert.equal(d.agreement.acceptedAt,"2026-01-01T00:00:00Z");assert.match(contractPlainText(c),/Unsigned/);
});
test("print copies escape customer content, include all terms and omit tokens and browser metadata",()=>{
 const b=booking(),d=details();b.customerName='<img src=x onerror=alert(1)>';d.agreement.text="<script>alert(1)</script>";const c=refreshContract(b,d);applyContractSignature(b,d,form(c),"PRIVATE-BROWSER");const html=contractPrintHtml(c);assert.doesNotMatch(html,/<script|<img|DO-NOT-PRINT-TOKEN|PRIVATE-BROWSER/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.match(html,/Electronically signed/);assert.match(html,new RegExp(c.hash));
});
