import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error('Referral tests require disposable SQLite.');
process.env.SHOPIFY_API_SECRET='synthetic-referral-secret';
process.env.SHOPIFY_APP_URL='https://booking.example.invalid';
await build({stdin:{contents:`export {default as db} from './app/db.server';export * from './app/leads.server';export * from './app/referral-source';export {createBooking,details} from './app/booking.server';export {inquiryToken} from './app/lead-access.server';export {action as bookingAction,loader as bookingLoader} from './app/routes/book.$shop';export {ReferralSourceField} from './app/ReferralSourceField';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:'tests/.referral-source.mjs'});
const m=await import('./.referral-source.mjs');
const {renderToStaticMarkup}=await import('react-dom/server');
const {createElement}=await import('react');
const owned=[];
const toForm=value=>{const f=new FormData();for(const [k,v] of Object.entries(value))f.set(k,v);return f;};
const form=(source='instagram')=>toForm({intent:'save-lead',leadToken:randomUUID(),name:'Synthetic referral test',email:'referral@example.invalid',confirmEmail:'referral@example.invalid',followUpConsent:'yes',referralSource:source});
const shop='referral-'+randomUUID()+'.myshopify.com';owned.push(shop);
try {
await m.db.bookingSettings.create({data:{shop,agreementText:'Synthetic terms',configJson:JSON.stringify({packages:[],addons:[]})}});
await test('referrals are optional; old submissions preserve known attribution',()=>{
 assert.deepEqual(m.readReferral(new FormData()),{referralSource:'',referralDetails:''});
 assert.deepEqual(m.readReferral(new FormData(),{referralSource:'instagram',referralDetails:''}),{referralSource:'instagram',referralDetails:''});
 assert.throws(()=>m.readReferral({referralSource:'invented'}),/valid answer/);
 assert.throws(()=>m.readReferral({referralSource:'other',referralDetails:'x'.repeat(201)}),/200/);
 assert.deepEqual(m.readReferral({referralSource:'facebook',referralDetails:'stale other text'}),{referralSource:'facebook',referralDetails:''});
});
await test('inquiry retry saves one source, keeps owner notes, and does not reopen a contacted lead',async()=>{
 const f=form('other');f.set('referralDetails','A local wedding directory');await m.saveLead(shop,f);
 const where={tokenHash:createHash('sha256').update(f.get('leadToken')).digest('hex')};
 let lead=await m.db.bookingLead.findUniqueOrThrow({where});assert.equal(lead.referralSource,'other');assert.equal(lead.referralDetails,'A local wedding directory');
 await m.db.bookingLead.update({where,data:{notes:'Owner note',status:'contacted',contactedAt:new Date()}});
 f.delete('referralSource');f.delete('referralDetails');await m.saveLead(shop,f);
 lead=await m.db.bookingLead.findUniqueOrThrow({where});assert.equal(lead.referralSource,'other');assert.equal(lead.referralDetails,'A local wedding directory');assert.equal(lead.notes,'Owner note');assert.equal(lead.status,'contacted');
 const invalid=form('invented');await assert.rejects(m.saveLead(shop,invalid),/valid answer/);
});
await test('source is retained through resume loader and conversion into a booking',async()=>{
 const f=form('google_search');await m.saveLead(shop,f);const lead=await m.db.bookingLead.findUniqueOrThrow({where:{tokenHash:createHash('sha256').update(f.get('leadToken')).digest('hex')}});
 const t=m.inquiryToken(lead,'resume');
 // A test store uses the same customer action without external payment or mail.
 const live='atelier-elunora-gallery-test.myshopify.com';owned.push(live);
 await m.db.bookingSettings.create({data:{shop:live,agreementText:'Synthetic agreement',configJson:JSON.stringify({packages:[{id:'test',name:'Test',priceCents:10000,maxGuests:200}],addons:[]})}});
 await m.db.bookingLead.update({where:{id:lead.id},data:{shop:live}});const liveLead=await m.db.bookingLead.findUniqueOrThrow({where:{id:lead.id}}),resume=m.inquiryToken(liveLead,'resume');
 const loaded=await m.bookingLoader({params:{shop:live},request:new Request('https://booking.example.invalid/book/'+live+'?inquiry='+resume)});assert.equal(loaded.resumeLead.referralSource,'google_search');
 const bf=toForm({leadToken:resume,name:'Synthetic referral test',email:'referral@example.invalid',confirmEmail:'referral@example.invalid',phone:'0000000000',startTime:'5 PM',venue:'Synthetic venue',date:'2027-09-19',guests:'100',package:'test',quoteRequest:'yes'});
 const response=await m.bookingAction({params:{shop:live},request:new Request('https://booking.example.invalid/book/'+live,{method:'POST',headers:{Origin:'https://booking.example.invalid'},body:bf})});assert.equal(response.status,302,JSON.stringify(response));
 const updated=await m.db.bookingLead.findUniqueOrThrow({where:{id:lead.id}}),booking=await m.db.weddingBooking.findUniqueOrThrow({where:{id:updated.bookingId}});assert.equal(m.details(booking).referralSource,'google_search');assert.equal(booking.paidCents,0);
});
await test('direct owner bookings accept unknown attribution without changing creation source',async()=>{
 const {booking}=await m.createBooking(shop,{name:'Synthetic Couple',email:'a@example.invalid',venue:'Synthetic venue',weddingDate:'2027-10-10',guests:20,addons:{},totalCents:10000,accepted:true,source:'owner',referralSource:'friend_family'});
 assert.equal(m.details(booking).source,'owner');assert.equal(m.details(booking).referralSource,'friend_family');
});
await test('source reporting labels missing data honestly and deduplicates linked bookings',()=>{
 const summary=m.summarizeReferrals([{referralSource:'instagram',booked:true,bookingId:'1'},{referralSource:'instagram',booked:true,bookingId:'1'},{referralSource:'other'},{referralSource:''}]);
 assert.deepEqual(summary.find(x=>x.source==='instagram'),{source:'instagram',label:'Instagram',inquiries:2,bookings:1});assert.equal(summary.find(x=>x.source==='').label,'Not provided');
 const html=renderToStaticMarkup(createElement(m.ReferralSourceField,{initial:{referralSource:'other',referralDetails:'<script>alert(1)</script>'}}));assert.match(html,/How did you hear about us/);assert.match(html,/name="referralDetails"/);assert.ok(!html.includes('<script>'));assert.ok(!html.includes(' required'));
});
await test('additive PostgreSQL migration retains existing leads and is idempotent',async()=>{
 const pg=new PGlite();try{await pg.exec('CREATE SCHEMA elunora_booking');await pg.exec(await readFile('azure/booking-leads.sql','utf8'));await pg.exec(`INSERT INTO elunora_booking."BookingLead"(id,shop,"tokenHash","customerName","customerEmail","consentAt","updatedAt")VALUES('old','test','hash','Old lead','old@example.invalid',now(),now())`);const sql=await readFile('azure/booking-referral-source.sql','utf8');await pg.exec(sql);await pg.exec(sql);const {rows}=await pg.query('SELECT id,"referralSource","referralDetails" FROM elunora_booking."BookingLead"');assert.deepEqual(rows,[{id:'old',referralSource:'',referralDetails:''}]);}finally{await pg.close()}
});
} finally {
 await m.db.bookingMail.deleteMany({where:{shop:{in:owned}}});await m.db.bookingEvent.deleteMany({where:{shop:{in:owned}}});await m.db.weddingBooking.deleteMany({where:{shop:{in:owned}}});await m.db.bookingLead.deleteMany({where:{shop:{in:owned}}});await m.db.bookingSettings.deleteMany({where:{shop:{in:owned}}});await m.db.$disconnect();await rm('tests/.referral-source.mjs',{force:true});
}
