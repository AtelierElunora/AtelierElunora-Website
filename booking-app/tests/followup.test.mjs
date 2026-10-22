import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error('Follow-up tests require disposable SQLite.');
process.env.SHOPIFY_API_SECRET='synthetic-inquiry-test-secret';
process.env.SHOPIFY_APP_URL='https://booking.example.invalid';
await build({entryPoints:['tests/followup-entry.ts'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:'tests/.followup-bundle.mjs'});
const m=await import('./.followup-bundle.mjs'),{db}=m,DAY=86400000,owned=[],leadIds=[];
const now=new Date(),at=n=>new Date(now.getTime()+n*DAY);
async function fixture(extra={}) {
 const shop='followup-'+randomUUID()+'.myshopify.com';owned.push(shop);
 await db.bookingSettings.create({data:{shop,configJson:JSON.stringify({leadFollowup:{enabled:true,since:at(-2).toISOString()}})}});
 const lead=await db.bookingLead.create({data:{shop,tokenHash:randomUUID(),customerName:'Synthetic Couple <script>',customerEmail:'couple@example.invalid',consentAt:now,createdAt:now,followUpAt:at(1),...extra}});
 const sends=[],provider={send:async(email,id)=>{sends.push({email,id});return {status:'submitted',providerId:id};},poll:async()=>({status:'review',providerId:null})};
 return {shop,lead,sends,provider,run:time=>m.runLeadFollowups(provider,'photos@example.invalid',new Set(['couple@example.invalid']),time,{shop})};
}
async function booking(f){return (await m.createBooking(f.shop,{name:'Synthetic Couple',email:'couple@example.invalid',venue:'Synthetic venue',weddingDate:'2035-06-01',guests:50,addons:{},totalCents:100000,accepted:true,source:'owner'})).booking;}
try {
await test('durable 24h/72h sequence deduplicates inquiries, scheduler replays and dispatch replays',async()=>{
 const f=await fixture();await db.bookingLead.create({data:{shop:f.shop,tokenHash:randomUUID(),customerName:'Latest name',customerEmail:'couple@example.invalid',consentAt:now,createdAt:new Date(now.getTime()+1000),followUpAt:at(1)}});
 await m.scheduleLeadFollowups(f.shop,now);await m.scheduleLeadFollowups(f.shop,now);assert.equal(await db.bookingMail.count({where:{shop:f.shop}}),2);
 await f.run(at(.99));assert.equal(f.sends.length,0);await f.run(at(1));await f.run(at(1));assert.equal(f.sends.length,1);assert.match(f.sends[0].email.content.plainText,/Latest name/);await f.run(at(3));await f.run(at(3));assert.equal(f.sends.length,2);assert.match(f.sends[1].email.content.plainText,/last automatic follow-up/);
});
await test('late first send delays second by at least 48h instead of bursting overdue mail',async()=>{
 const f=await fixture();await f.run(at(2.9));assert.equal(f.sends.length,1);await f.run(at(3));assert.equal(f.sends.length,1);await f.run(at(4.91));assert.equal(f.sends.length,2);
});
await test('pause retains jobs; resuming preserves the same sequence',async()=>{
 const f=await fixture();await m.scheduleLeadFollowups(f.shop,now);await m.setFollowupEnabled(f.shop,false);await f.run(at(1));assert.equal(f.sends.length,0);assert.equal(await db.bookingMail.count({where:{shop:f.shop,status:'pending'}}),2);await m.setFollowupEnabled(f.shop,true);await f.run(at(1));assert.equal(f.sends.length,1);
});
await test('closure, personal contact, old inquiries and past dates prevent sends',async()=>{
 for(const extra of [{status:'declined'},{status:'contacted',contactedAt:now},{createdAt:at(-8),followUpAt:at(-7)},{weddingDate:'2020-01-01'}]){const f=await fixture(extra);await f.run(at(1));assert.equal(f.sends.length,0);}
});
await test('paid, cancelled, review, waitlist and quoted bookings prevent chasing the customer',async()=>{
 for(const status of ['confirmed','cancelled','paid_review','waitlist','quote_review','quote_offered']){const f=await fixture(),b=await booking(f);await db.bookingLead.update({where:{id:f.lead.id},data:{bookingId:b.id}});await db.weddingBooking.update({where:{id:b.id},data:{status}});await f.run(at(1));assert.equal(f.sends.length,0,status);}
 const f=await fixture(),b=await booking(f);await db.bookingPayment.create({data:{shop:f.shop,bookingId:b.id,kind:'prepayment',status:'review',currency:'USD',amountCents:30000,expectedGrandTotalCents:30000}});await f.run(at(1));assert.equal(f.sends.length,0);
});
await test('payment or opt-out between messages stops the second, including unlinked payments',async()=>{
 const f=await fixture();await f.run(at(1));const b=await booking(f);await db.weddingBooking.update({where:{id:b.id},data:{paidCents:30000,status:'confirmed'}});await f.run(at(3));assert.equal(f.sends.length,1);
 const g=await fixture();await g.run(at(1));await m.stopInquiryFollowups(g.shop,g.lead.customerEmail);await g.run(at(3));assert.equal(g.sends.length,1);assert.equal(await db.bookingMail.count({where:{shop:g.shop,status:'suppressed'}}),1);
});
await test('test-store allowlists and uncertain submissions never cause a blind resend',async()=>{
 const f=await fixture();await m.runLeadFollowups(f.provider,'photos@example.invalid',new Set(),at(1),{shop:f.shop});assert.equal(f.sends.length,0);
 f.provider.send=async(email,id)=>{f.sends.push({email,id});return {status:'review',providerId:null};};await f.run(at(1));await f.run(at(3));assert.equal(f.sends.length,1);
});
await test('access tokens expire, separate purposes/shops, reject tampering and invalidate changed emails',async()=>{
 const f=await fixture(),t=m.inquiryToken(f.lead,'resume',now.getTime());assert.ok(m.validInquiryToken(f.lead,t,'resume',now.getTime()));for(const [lead,raw,purpose,time] of [[f.lead,t,'stop',now],[{...f.lead,shop:'other'},t,'resume',now],[{...f.lead,customerEmail:'other@example.invalid'},t,'resume',now],[f.lead,t+'!','resume',now],[f.lead,t,'resume',at(15)]])assert.equal(m.validInquiryToken(lead,raw,purpose,time.getTime()),false);assert.equal((await m.leadForToken(f.shop,t)).id,f.lead.id);assert.equal(await m.leadForToken('other',t),null);
});
await test('GET cannot unsubscribe; POST requires the correct purpose and origin',async()=>{
 const f=await fixture(),t=m.inquiryToken(f.lead,'stop'),url=`https://booking.example.invalid/inquiry/${f.lead.id}?stop=${t}`;await m.inquiryLoader({request:new Request(url),params:{id:f.lead.id}});assert.equal((await db.bookingLead.findUniqueOrThrow({where:{id:f.lead.id}})).status,'new');
 await assert.rejects(m.inquiryAction({request:new Request(url,{method:'POST',headers:{Origin:'https://evil.example.invalid'},body:new URLSearchParams({op:'stop'})}),params:{id:f.lead.id}}),e=>e.status===403);
 await m.inquiryAction({request:new Request(url,{method:'POST',headers:{Origin:'https://booking.example.invalid'},body:new URLSearchParams({op:'stop'})}),params:{id:f.lead.id}});assert.equal((await db.bookingLead.findUniqueOrThrow({where:{id:f.lead.id}})).status,'declined');const expired=await m.inquiryLoader({request:new Request(url+'bad'),params:{id:f.lead.id}});assert.equal(expired.init.status,410);
});
await test('linked recovery reuses the same booking and agreement without creating a new hold',async()=>{
 const f=await fixture(),b=await booking(f);await db.bookingLead.update({where:{id:f.lead.id},data:{bookingId:b.id}});const t=m.inquiryToken(f.lead,'resume'),url=`https://booking.example.invalid/inquiry/${f.lead.id}?token=${t}`;
 const response=await m.inquiryAction({request:new Request(url,{method:'POST',headers:{Origin:'https://booking.example.invalid'},body:new URLSearchParams({op:'continue'})}),params:{id:f.lead.id}});assert.equal(response.status,302);const target=new URL(response.headers.get('Location'),'https://booking.example.invalid');assert.equal(target.pathname,'/portal/'+b.id);assert.equal((await m.portalBooking(b.id,target.searchParams.get('token'))).id,b.id);assert.equal(await db.weddingBooking.count({where:{shop:f.shop}}),1);
});
await test('follow-up template is branded, escaped, actionable and has no invented prices or empty summary',()=>{
 const email=m.bookingEmail('lead_followup_1',{customerName:'Alex <script>',weddingDate:'',balanceDueDate:null,totalCents:0,paidCents:0,status:'inquiry'},{currency:'USD',followupStopUrl:'https://example.invalid/stop'},'https://example.invalid/resume');assert.match(email.html,/Alex &lt;script&gt;/);assert.match(email.html,/Stop inquiry follow-ups/);assert.match(email.html,/Atelier Elunora, LLC/);assert.match(email.plainText,/expires in 14 days/);assert.ok(!email.html.includes('aria-label="Event summary"'));assert.ok(!email.html.includes('Remaining balance'));
});
await test('signed inquiry resumes contact data with fresh availability; saving does not duplicate the lead',async()=>{
 const shop='atelier-elunora-gallery-test.myshopify.com',existed=await db.bookingSettings.findUnique({where:{shop}});if(!existed){owned.push(shop);await db.bookingSettings.create({data:{shop}});}const lead=await db.bookingLead.create({data:{shop,tokenHash:randomUUID(),customerName:'Resume Fixture',customerEmail:'resume@example.invalid',consentAt:now,venue:'Synthetic venue',guests:100}});leadIds.push(lead.id);const t=m.inquiryToken(lead,'resume'),c=await m.bookingLoader({request:new Request(`https://booking.example.invalid/book/${shop}?inquiry=${t}`),params:{shop}});assert.equal(c.resumeLead.name,lead.customerName);assert.equal(c.resumeLead.guests,100);assert.ok(c.availability.length);assert.ok(!('tokenHash' in c.resumeLead));
 const form=new FormData();for(const [k,v] of Object.entries({leadToken:t,name:lead.customerName,email:lead.customerEmail,confirmEmail:lead.customerEmail,followUpConsent:'yes',venue:'Updated venue'}))form.set(k,v);await m.saveLead(shop,form);assert.equal((await db.bookingLead.findUniqueOrThrow({where:{id:lead.id}})).venue,'Updated venue');await assert.rejects(m.bookingLoader({request:new Request(`https://booking.example.invalid/book/${shop}?inquiry=bad`),params:{shop}}),e=>e.status===410);
});
}finally{
 await db.bookingLead.deleteMany({where:{OR:[{shop:{in:owned}},{id:{in:leadIds}}]}});for(const table of ['bookingMail','bookingPayment','bookingEvent','weddingBooking','bookingSettings'])await db[table].deleteMany({where:{shop:{in:owned}}});await db.$disconnect();await rm('tests/.followup-bundle.mjs',{force:true});
}
