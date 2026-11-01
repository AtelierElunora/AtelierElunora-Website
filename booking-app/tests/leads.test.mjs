import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error('Lead tests require disposable SQLite.');
await build({entryPoints:['tests/leads-entry.ts'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:'tests/.leads-bundle.mjs'});
const {db,saveLead,linkLead,listLeads,updateLead,createBooking,captureAction}=await import('./.leads-bundle.mjs');
const shop='lead-test-'+randomUUID()+'.myshopify.com', other=shop+'-other';
const form=(token=randomUUID())=>new FormData();
function inquiry(token=randomUUID()) {const f=form();for(const [key,value] of Object.entries({leadToken:token,name:'Synthetic Couple',email:'COUPLE@example.invalid',confirmEmail:'couple@example.invalid',followUpConsent:'yes'}))f.set(key,value);return f;}
try {
await db.bookingSettings.create({data:{shop,dailyCapacity:1}});
await test('explicit consent is required; validation rejects malformed contacts and bot submissions',async()=>{
 const f=inquiry();f.delete('followUpConsent');await assert.rejects(saveLead(shop,f),/allow/);
 f.set('followUpConsent','yes');f.set('email','invalid');await assert.rejects(saveLead(shop,f),/valid email/);
 const bot=inquiry();bot.set('companyWebsite','https://example.invalid');await assert.rejects(saveLead(shop,bot));
 const invalid=inquiry();invalid.set('date','2027-02-30');await assert.rejects(saveLead(shop,invalid),/valid wedding/);
 invalid.set('date','2027-07-24');invalid.set('guests','1.5');await assert.rejects(saveLead(shop,invalid),/guest count/);
 assert.equal(await db.bookingLead.count({where:{shop}}),0);
});
await test('saving and retrying an inquiry creates no booking, contract, date hold or mail',async()=>{
 const f=inquiry();const firstConversion=await saveLead(shop,f);f.set('date','2027-07-24');f.set('venue','Synthetic venue');f.set('guests','100');const repeatedConversion=await saveLead(shop,f);
 assert.match(firstConversion.conversionId,/^[a-f0-9]{64}$/);assert.equal(firstConversion.conversionId,repeatedConversion.conversionId);
 assert.notEqual(firstConversion.conversionId,f.get('leadToken'));assert.notEqual(firstConversion.conversionId,(await import('node:crypto')).createHash('sha256').update(f.get('leadToken')).digest('hex'));
 const leads=await listLeads(shop);assert.equal(leads.length,1);assert.equal(leads[0].guests,100);assert.equal(leads[0].customerEmail,'couple@example.invalid');assert.ok(!('tokenHash' in leads[0]));
 assert.equal(await db.weddingBooking.count({where:{shop}}),0);assert.equal(await db.bookingMail.count({where:{shop}}),0);
 await assert.rejects(saveLead(other,f));assert.equal((await listLeads(other)).length,0);
 const change=new FormData();change.set('id',leads[0].id);change.set('status','contacted');change.set('followUpAt','2020-01-01');change.set('notes','Synthetic note');
 await assert.rejects(updateLead(other,change),/not found/);await updateLead(shop,change);
 assert.equal((await listLeads(shop))[0].followUpDue,true);
 change.set('status','declined');await updateLead(shop,change);await saveLead(shop,f);assert.equal((await listLeads(shop))[0].followUpDue,false);
});
await test('booking linkage requires the browser token, shop and matching email; only confirmed bookings stop reminders',async()=>{
 const f=inquiry();f.set('date','2027-08-01');await saveLead(shop,f);
 const {booking}=await createBooking(shop,{name:'Synthetic Couple',email:'couple@example.invalid',venue:'Synthetic venue',weddingDate:'2027-08-01',guests:100,addons:{},totalCents:149500,accepted:false,source:'owner'});
 const record=await db.bookingLead.findUniqueOrThrow({where:{tokenHash:(await import('node:crypto')).createHash('sha256').update(f.get('leadToken')).digest('hex')}});
 await db.bookingLead.update({where:{id:record.id},data:{followUpAt:new Date('2020-01-01')}});
 await linkLead(other,f.get('leadToken'),booking);await linkLead(shop,f.get('leadToken'),{...booking,customerEmail:'other@example.invalid'});
 assert.equal((await db.bookingLead.findUniqueOrThrow({where:{id:record.id}})).bookingId,null);
 await linkLead(shop,f.get('leadToken'),booking);assert.equal((await listLeads(shop)).find(l=>l.id===record.id).followUpDue,true);
 await db.weddingBooking.update({where:{id:booking.id},data:{status:'confirmed'}});
 const linked=(await listLeads(shop)).find(l=>l.id===record.id);assert.equal(linked.booked,true);assert.equal(linked.followUpDue,false);
 f.set('email','changed@example.invalid');f.set('confirmEmail','changed@example.invalid');await saveLead(shop,f);
 assert.equal((await db.bookingLead.findUniqueOrThrow({where:{id:record.id}})).customerEmail,'couple@example.invalid');
});
await test('public capture rejects cross-origin requests and unsupported stores',async()=>{
 const origin=new URL(process.env.SHOPIFY_APP_URL || 'https://booking.example.invalid').origin;
 const req=new Request(origin+'/book/'+shop,{method:'POST',headers:{Origin:'https://evil.example.invalid'},body:inquiry()});
 await assert.rejects(captureAction({request:req,params:{shop},context:{}}),e=>e instanceof Response&&e.status===403);
 const valid=new Request(origin+'/book/'+shop,{method:'POST',headers:{Origin:origin},body:inquiry()});
 await assert.rejects(captureAction({request:valid,params:{shop},context:{}}),e=>e instanceof Response&&e.status===404);
});
} finally {
 await db.bookingLead.deleteMany({where:{shop}});await db.bookingEvent.deleteMany({where:{shop}});await db.weddingBooking.deleteMany({where:{shop}});await db.bookingSettings.deleteMany({where:{shop}});await db.$disconnect();await rm('tests/.leads-bundle.mjs',{force:true});
}
