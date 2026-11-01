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
await build({entryPoints:['app/routes/wedding-inquiry.$shop.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'tests/.wedding-inquiry.mjs',plugins:[{name:'isolate-database-and-payments',setup(b){
 b.onResolve({filter:/db\.server$/},()=>({path:'db',namespace:'mock'}));
 b.onResolve({filter:/booking\.server$/},()=>({path:'origin',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:path==='db'?'export default globalThis.__inquiryDB;':'export function requireOrigin(request){if(request.headers.get("Origin")!==new URL(request.url).origin)throw new Response("Invalid request origin",{status:403});}',loader:'js'}));
}}]});
globalThis.__inquiryDB.$transaction=async fn=>fn(globalThis.__inquiryDB);
const queuedNotices=new Map();globalThis.__inquiryDB.bookingMail={upsert:async({where,create})=>{if(!queuedNotices.has(where.id))queuedNotices.set(where.id,create);return queuedNotices.get(where.id);}};
const {action,loader}=await import('./.wedding-inquiry.mjs');
const shop='v0j63n-ms.myshopify.com',origin='https://booking.example.invalid';
const form=()=>{const f=new FormData();Object.entries({intent:'wedding-inquiry',leadToken:randomUUID(),name:'Synthetic Couple',email:'test@example.invalid',confirmEmail:'test@example.invalid',followUpConsent:'yes'}).forEach(([k,v])=>f.set(k,v));return f;};
const submit=(f,from=origin,store=shop)=>action({params:{shop:store},request:new Request(origin+'/wedding-inquiry/'+store,{method:'POST',headers:{Origin:from},body:f}),context:{}});
try {
await test('standalone inquiry saves optional details, schedules CRM follow-up and retries idempotently',async()=>{
 const f=form();f.set('date','2027-08-15');f.set('venue','Synthetic venue');f.set('guests','190');
 const a=(await submit(f)).data,b=(await submit(f)).data;
 assert.equal(a.saved,true);assert.equal(a.conversionId,b.conversionId);assert.equal(records.size,1);
 const lead=[...records.values()][0];assert.equal(lead.guests,190);assert.equal(lead.venue,'Synthetic venue');assert.ok(lead.consentAt);assert.ok(lead.followUpAt>Date.now());assert.equal(lead.bookingId,undefined);
});
await test('undecided date, venue and guest count are accepted without booking',async()=>{assert.equal((await submit(form())).data.saved,true);});
await test('invalid contacts, missing consent, bots, dates and guest counts do not create leads',async()=>{
 const before=records.size;
 for(const [k,v] of [['followUpConsent',''],['companyWebsite','spam'],['email','bad'],['confirmEmail','other@example.invalid'],['date','2027-02-30'],['date','2020-01-01'],['guests','1.5'],['guests','5001'],['intent','create-booking']]){const f=form();f.set(k,v);assert.equal((await submit(f)).data.saved,false,k);}
 assert.equal(records.size,before);
});
await test('cross-origin, unsupported-store and oversized requests are rejected',async()=>{
 await assert.rejects(submit(form(),'https://evil.example'),e=>e.status===403);
 await assert.rejects(submit(form(),origin,'other.myshopify.com'),e=>e.status===404);
 await assert.rejects(action({params:{shop},request:new Request(origin+'/wedding-inquiry/'+shop,{method:'POST',headers:{Origin:origin,'content-length':'20000'},body:form()})}),e=>e.status===413);
});
await test('loader allows only exact storefront reporting destinations',async()=>{
 const c=await loader({params:{shop},request:new Request(origin+'/wedding-inquiry/'+shop+'?parentOrigin=https://evil.example')});assert.equal(c.data.parentOrigin,'');assert.match(c.data.leadToken,/^[a-f0-9-]{36}$/);
});

const js=await readFile('tests/fixtures/storefront/atelier-wedding-inquiry.js','utf8');
function browser(allowed=true){
 const messages=[],events=[],published=[],storage=new Map();let message,click;
 const frame={dataset:{inquiryUrl:'https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net/wedding-inquiry/'+shop},contentWindow:{},height:'900'};
 const section={dataset:{},querySelector:()=>frame,focus:()=>{}};
 const ctx={Set,URL,Number,location:{origin:'https://www.atelierelunora.com',pathname:'/pages/packages'},document:{querySelectorAll:s=>s.startsWith('a[')?[{addEventListener:(n,f)=>{click=f}}]:[section],addEventListener:()=>{}},window:{gtag:(...x)=>events.push(x),Shopify:{customerPrivacy:{analyticsProcessingAllowed:()=>allowed,marketingAllowed:()=>allowed,saleOfDataAllowed:()=>allowed},analytics:{publish:(...x)=>published.push(x)}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},addEventListener:(n,f)=>{message=f}}};
 vm.runInNewContext(js,ctx);
 return {frame,events,published,click,send:(data,override={})=>message({data,source:frame.contentWindow,origin:'https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net',...override})};
}
await test('button, form start and saved lead are distinct; repeated and forged messages cannot create conversions',()=>{
 const b=browser();b.click();b.send({type:'elunora:inquiry-started'});b.send({type:'elunora:inquiry-started'});
 const saved={type:'elunora:inquiry-saved',conversionId:'a'.repeat(64)};
 b.send(saved,{origin:'https://evil.example'});b.send(saved,{source:{}});assert.equal(b.events.length,2);
 b.send(saved);b.send(saved);assert.deepEqual(b.events.map(e=>e[1]),['availability_click','form_start','generate_lead']);assert.equal(b.published.length,1);
 assert.ok(!JSON.stringify(b.events).includes('test@example.invalid'));assert.ok(!JSON.stringify(b.events).includes('conversionId'));
 b.send({type:'elunora:inquiry-height',height:90000});assert.equal(b.frame.height,'1600');
});
await test('denied tracking consent prevents all Google events while saving remains independent',()=>{
 const b=browser(false);b.click();b.send({type:'elunora:inquiry-started'});b.send({type:'elunora:inquiry-saved',conversionId:'b'.repeat(64)});assert.equal(b.events.length,0);
});
} finally {await rm('tests/.wedding-inquiry.mjs',{force:true});delete globalThis.__inquiryDB;}
