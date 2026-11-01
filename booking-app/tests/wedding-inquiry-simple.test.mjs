import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
const records=new Map();
globalThis.__inquiryDB={bookingSettings:{findUniqueOrThrow:async()=>({})},bookingLead:{
 findUnique:async({where})=>records.get(where.tokenHash)||null,
 findFirst:async()=>null,
 upsert:async({where,create,update})=>{const lead=records.has(where.tokenHash)?{...records.get(where.tokenHash),...update}:{...create,id:randomUUID(),status:'new'};records.set(where.tokenHash,lead);return lead;}
}};
await build({entryPoints:['app/routes/wedding-inquiry-simple.$shop.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'tests/.wedding-inquiry-simple.mjs',plugins:[{name:'isolate-database-and-payments',setup(b){
 b.onResolve({filter:/db\.server$/},()=>({path:'db',namespace:'mock'}));
 b.onResolve({filter:/booking\.server$/},()=>({path:'origin',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:path==='db'?'export default globalThis.__inquiryDB;':'export function requireOrigin(request){if(request.headers.get("Origin")!==new URL(request.url).origin)throw new Response("Invalid request origin",{status:403});}',loader:'js'}));
}}]});
globalThis.__inquiryDB.$transaction=async fn=>fn(globalThis.__inquiryDB);
const queuedNotices=new Map();globalThis.__inquiryDB.bookingMail={upsert:async({where,create})=>{if(!queuedNotices.has(where.id))queuedNotices.set(where.id,create);return queuedNotices.get(where.id);}};
const {action,loader}=await import('./.wedding-inquiry-simple.mjs');
const shop='v0j63n-ms.myshopify.com',origin='https://booking.example.invalid';
const form=()=>{const f=new FormData();Object.entries({intent:'wedding-inquiry',leadToken:randomUUID(),name:'Synthetic Couple',email:'test@example.invalid',followUpConsent:'yes'}).forEach(([k,v])=>f.set(k,v));return f;};
const submit=(f,from=origin,store=shop)=>action({params:{shop:store},request:new Request(origin+'/wedding-inquiry-simple/'+store,{method:'POST',headers:{Origin:from},body:f}),context:{}});
try {
await test('single-email inquiry saves optional details, schedules CRM follow-up and retries idempotently',async()=>{
 const f=form();f.set('date','2027-08-15');f.set('venue','Synthetic venue');f.set('guests','190');
 const a=(await submit(f)).data,b=(await submit(f)).data;
 assert.equal(a.saved,true);assert.equal(a.conversionId,b.conversionId);assert.equal(records.size,1);
 const lead=[...records.values()][0];assert.equal(lead.guests,190);assert.equal(lead.venue,'Synthetic venue');assert.ok(lead.consentAt);assert.ok(lead.followUpAt>Date.now());assert.equal(lead.bookingId,undefined);
});
await test('undecided date, venue and guest count are accepted without booking',async()=>{assert.equal((await submit(form())).data.saved,true);});
await test('invalid contacts, missing consent, bots, dates and guest counts do not create leads',async()=>{
 const before=records.size;
 for(const [k,v] of [['followUpConsent',''],['companyWebsite','spam'],['email','bad'],['date','2027-02-30'],['date','2020-01-01'],['guests','1.5'],['guests','5001'],['intent','create-booking']]){const f=form();f.set(k,v);assert.equal((await submit(f)).data.saved,false,k);}
 assert.equal(records.size,before);
});
await test('cross-origin, unsupported-store and oversized requests are rejected',async()=>{
 await assert.rejects(submit(form(),'https://evil.example'),e=>e.status===403);
 await assert.rejects(submit(form(),origin,'other.myshopify.com'),e=>e.status===404);
 await assert.rejects(action({params:{shop},request:new Request(origin+'/wedding-inquiry-simple/'+shop,{method:'POST',headers:{Origin:origin,'content-length':'20000'},body:form()})}),e=>e.status===413);
});
await test('loader allows only exact storefront reporting destinations',async()=>{
 const c=await loader({params:{shop},request:new Request(origin+'/wedding-inquiry-simple/'+shop+'?parentOrigin=https://evil.example')});assert.equal(c.data.parentOrigin,'');assert.match(c.data.leadToken,/^[a-f0-9-]{36}$/);
});

} finally {await rm('tests/.wedding-inquiry-simple.mjs',{force:true});delete globalThis.__inquiryDB;}
