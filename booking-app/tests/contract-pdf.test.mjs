import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {build} from "esbuild";
const require=createRequire(import.meta.url);
async function moduleAt(file){
  const result=await build({entryPoints:[file],bundle:true,platform:"node",format:"cjs",packages:"external",write:false});
  const module={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(require,module,module.exports);return module.exports;
}
const {contractPdfDefinition,contractPdfFilename,createContractPdf}=await moduleAt("app/contract-pdf.ts");
const {refreshContract,applyContractSignature,applyProviderSignature}=await moduleAt("app/booking-contract.server.ts");
const booking={id:"PDF-SAMPLE",customerName:"Alex & Jordan",customerEmail:"couple@example.invalid",venue:"Example venue",weddingDate:"2030-07-24",totalCents:149500,balanceDueDate:"2030-06-24"};
function sample(full=true){
 const details={currency:"USD",prepaymentPercent:30,phone:"+15555550101",preferredStartTime:"5 PM",guests:150,package:{name:"Up to 150 guests",priceCents:149500},addons:[],agreement:{text:"Approved sample booking terms",version:1,preparedAt:"2026-10-20T12:00:00Z",fields:{mailingAddress:"2 Sample Lane"},...(full?{eventTemplate:{enabled:true,providerLegalName:"Example Studio LLC",providerAddress:"1 Example Lane",providerEmail:"studio@example.invalid",providerPhone:"+15555550100",backupDeletionPeriod:"Sample policy only"}}:{})}};
 return {details,contract:refreshContract(booking,details)};
}
function sign(c,d){
 const f=new FormData();for(const[k,v]of Object.entries({contractHash:c.hash,signatureName:"Alex Example",signatureStyle:"script",signatureConsent:"yes",providerName:"Studio Owner",providerTitle:"Owner",providerConsent:"yes"}))f.set(k,v);
 applyContractSignature(booking,d,f);applyProviderSignature(booking,d,f);
}
test("PDF export contains every reviewed section, both receipts and the exact document hash",async()=>{
 const {contract:c,details:d}=sample();sign(c,d);
 const definition=contractPdfDefinition(c),text=JSON.stringify(definition);
 for(const section of c.document.serviceAgreement.sections){assert.ok(text.includes(section.heading));for(const p of section.paragraphs)assert.ok(text.includes(JSON.stringify(p).slice(1,-1)));}
 for(const part of [c.hash.slice(0,32),c.hash.slice(32),"Alex Example","Studio Owner",c.signature.signedAt,c.signature.consent,c.providerSignature.consent])assert.ok(text.includes(part));
 assert.doesNotMatch(text,/"(?:userAgent|portalHash|method)"\s*:/);
 const blob=await createContractPdf(c),bytes=Buffer.from(await blob.arrayBuffer());
 assert.equal(blob.type,"application/pdf");assert.match(bytes.subarray(0,8).toString(),/^%PDF-/);assert.match(bytes.subarray(-20).toString(),/%%EOF/);assert.ok(bytes.length>10000);
});
test("unsigned and legacy PDF copies cannot imply saved signatures; download names are safe",async()=>{
 const full=JSON.stringify(contractPdfDefinition(sample().contract));assert.doesNotMatch(full,/Client electronically signed|Provider electronically signed/);
 const {contract:c}=sample(false);c.document.customerName="<script>plain text</script>";
 assert.match(JSON.stringify(contractPdfDefinition(c)),/Awaiting electronic signature/);
 assert.doesNotMatch(JSON.stringify(contractPdfDefinition(c)),/Client electronically signed|Provider electronically signed/);
 c.document.reference="../../private/token?value";assert.equal(contractPdfFilename(c),"Atelier-Elunora-Agreement-------private-token-value-r1.pdf");
 const blob=await createContractPdf(c);assert.ok(blob.size>10000);
});
