import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error('Disposable SQLite only');
await build({stdin:{contents:`export {default as db} from './app/db.server';export * from './app/google-ads';export * from './app/google-ads.server';export {saveLead} from './app/leads.server';export {GoogleAdsAttributionFields} from './app/GoogleAdsAttributionFields';export {parseConfig} from './app/booking-rules';export {liveBookingShop} from './app/live-store';`,resolveDir:process.cwd(),loader:'ts'},jsx:'automatic',bundle:true,platform:'node',format:'esm',packages:'external',outfile:'tests/.google-ads.mjs'});
const m=await import('./.google-ads.mjs'),shop=m.liveBookingShop,other='ads-test-'+randomUUID();
const now=new Date(),click=new Date(now.getTime()-3600000),a={gclid:'synthetic_GCLID_123456',capturedAt:click.toISOString(),consentAt:new Date(now.getTime()-1800000).toISOString()};
const f=new FormData();for(const[k,v]of Object.entries({leadToken:randomUUID(),name:'Synthetic Ads Test',email:'ads@example.invalid',confirmEmail:'ads@example.invalid',followUpConsent:'yes',googleAdsConsent:'yes',googleAdsClickId:a.gclid,googleAdsClickedAt:a.capturedAt}))f.set(k,v);
const realRowCount=csv=>csv.trim().split('\r\n').filter(line=>line.endsWith(',"conversion"')).length;
let credentials;
const request=(kind,password=credentials?.password)=>new Request('https://booking.example.invalid/feed/'+kind,{headers:{Authorization:'Basic '+Buffer.from(credentials.username+':'+password).toString('base64')}});
try{
await m.db.bookingSettings.create({data:{shop}});await m.db.bookingSettings.create({data:{shop:other}});
await test('empty schema fixture is explicit, unmatchable and outside the attribution window',()=>{
 const csv=m.conversionCsv([],true);assert.match(csv,/Record_Type/);assert.match(csv,/\r\n"SETUP ONLY: NOT A GOOGLE CLICK ID","2000-01-01/);assert.match(csv,/2000-01-01/);assert.equal(m.readGoogleAttribution(new Map([["googleAdsConsent","yes"],["googleAdsClickId","SETUP ONLY: NOT A GOOGLE CLICK ID"],["googleAdsClickedAt",now.toISOString()]])),null);assert.equal(realRowCount(csv),0);assert.equal(csv.trim().split('\r\n').length,2);
 const real=m.conversionCsv([{gclid:a.gclid,time:now,orderId:'elunora-real'}],true);assert.equal(realRowCount(real),1);assert.ok(!real.includes('setup_test'));assert.equal(m.conversionCsv([]).trim().split('\r\n').length,1);
});
await test('pending iframe consent does not masquerade as an opt-out',async()=>{const{renderToStaticMarkup}=await import('react-dom/server');const{createElement}=await import('react');const html=renderToStaticMarkup(createElement(m.GoogleAdsAttributionFields,{parentOrigin:'https://www.atelierelunora.com'}));assert.match(html,/name="googleAdsConsent" value=""/);});
await test('public booking configuration never exposes feed credentials or hashes',()=>{const c=m.parseConfig(JSON.stringify({googleAdsFeed:{enabled:true,username:'private',passwordHash:'private-hash'}}));assert.ok(!('googleAdsFeed' in c));});
await test('requires separate tracking consent, valid IDs and a recent click',()=>{
 assert.ok(m.readGoogleAttribution(f));f.set('googleAdsConsent','no');assert.equal(m.readGoogleAttribution(f),null);f.set('googleAdsConsent','yes');
 assert.equal(m.eligibleGoogleOutcome(null,now),false);assert.equal(m.eligibleGoogleOutcome({...a,capturedAt:'invalid'},now),false);assert.equal(m.eligibleGoogleOutcome(a,now),true);assert.equal(m.eligibleGoogleOutcome({...a,capturedAt:new Date(now.getTime()-91*86400000).toISOString()},now),false);
});
await test('captures attribution once and protects cross-store qualification',async()=>{
 await m.saveLead(shop,f);await m.saveLead(shop,f);const events=await m.db.bookingEvent.findMany({where:{shop,kind:m.GOOGLE_ADS_ATTRIBUTION_KIND}});assert.equal(events.length,1);
 await assert.rejects(m.setGoogleAdsQualified(other,events[0].bookingId,true));
});
await test('feed disabled by default, credentials hashed, invalid auth rejected',async()=>{
 assert.equal((await m.googleAdsFeed(new Request('https://booking.example.invalid'),shop,'qualified')).status,401);
 credentials=await m.createGoogleAdsFeed(shop);const c=JSON.parse((await m.db.bookingSettings.findUniqueOrThrow({where:{shop}})).configJson);assert.ok(!JSON.stringify(c).includes(credentials.password));assert.equal(c.googleAdsFeed.passwordHash,createHash('sha256').update(credentials.password).digest('hex'));
 assert.equal((await m.googleAdsFeed(request('qualified','wrong'),shop,'qualified')).status,401);assert.equal((await m.googleAdsFeed(request('qualified'),other,'qualified')).status,404);
});
await test('setup preview is opt-in and cannot be attributed, with no sample records written',async()=>{
 const before=await m.db.bookingLead.count({where:{shop}});const standard=await(await m.googleAdsFeed(request('qualified'),shop,'qualified')).text();assert.ok(!standard.includes('setup_test'));
 for (const kind of ['qualified-preview','booked-preview']) {
  assert.equal((await m.googleAdsFeed(request(kind,'wrong'),shop,kind)).status,401);
  assert.equal((await m.googleAdsFeed(request(kind),other,kind)).status,404);
  const response=await m.googleAdsFeed(request(kind),shop,kind);assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/csv/);const body=await response.text();assert.match(body,/setup_test/);assert.match(body,/\r\n"SETUP ONLY: NOT A GOOGLE CLICK ID","2000-01-01/);assert.equal(realRowCount(body),0);
 }
 const req=request('qualified');const preview=new Request(req.url+'?setup_preview=true',{headers:req.headers});const csv=await(await m.googleAdsFeed(preview,shop,'qualified')).text();assert.match(csv,/\r\n"SETUP ONLY: NOT A GOOGLE CLICK ID","2000-01-01/);assert.equal(realRowCount(csv),0);assert.equal(await m.db.bookingLead.count({where:{shop}}),before);
});
await test('qualification exports exactly one anonymous row and stable timestamp',async()=>{
 const lead=await m.db.bookingLead.findFirstOrThrow({where:{shop}});await m.setGoogleAdsQualified(shop,lead.id,true);
 const event=await m.db.bookingEvent.findUniqueOrThrow({where:{id:m.googleAdsEventId(shop,lead.id,m.GOOGLE_ADS_QUALIFIED_KIND)}});
 const first=await(await m.googleAdsFeed(request('qualified'),shop,'qualified')).text();assert.equal(realRowCount(first),1);assert.ok(first.includes(a.gclid));assert.ok(!first.includes(lead.customerEmail));assert.ok(!first.includes(lead.id));assert.ok(!first.includes('Synthetic Ads'));
 await m.setGoogleAdsQualified(shop,lead.id,false);assert.equal(realRowCount(await(await m.googleAdsFeed(request('qualified'),shop,'qualified')).text()),0);
 await m.setGoogleAdsQualified(shop,lead.id,true);assert.equal((await m.db.bookingEvent.findUniqueOrThrow({where:{id:event.id}})).createdAt.getTime(),event.createdAt.getTime());assert.equal(await(await m.googleAdsFeed(request('qualified'),shop,'qualified')).text(),first);
 await m.db.bookingLead.update({where:{id:lead.id},data:{status:'declined'}});assert.equal(realRowCount(await(await m.googleAdsFeed(request('qualified'),shop,'qualified')).text()),0);await m.db.bookingLead.update({where:{id:lead.id},data:{status:'new'}});
});
await test('confirmed booking feed excludes unpaid, cancelled and unattributed bookings',async()=>{
 const lead=await m.db.bookingLead.findFirstOrThrow({where:{shop}});const booking=await m.db.weddingBooking.create({data:{shop,customerName:lead.customerName,customerEmail:lead.customerEmail,weddingDate:'2027-07-17',venue:'Synthetic',totalCents:100000,status:'hold',detailsJson:'{}'}});
 await m.db.bookingLead.update({where:{id:lead.id},data:{bookingId:booking.id}});const id=m.googleAdsEventId(shop,booking.id,m.GOOGLE_ADS_BOOKED_KIND);await m.db.bookingEvent.create({data:{id,shop,bookingId:booking.id,kind:m.GOOGLE_ADS_BOOKED_KIND,text:lead.id}});
 const count=async()=>realRowCount(await(await m.googleAdsFeed(request('booked'),shop,'booked')).text());
 assert.equal(await count(),0);await m.db.weddingBooking.update({where:{id:booking.id},data:{status:'confirmed',paidCents:10000}});assert.equal(await count(),1);await m.db.weddingBooking.update({where:{id:booking.id},data:{status:'cancelled'}});assert.equal(await count(),0);
});
await test('consent removal, credential rotation and revocation stop exports',async()=>{
 f.set('googleAdsConsent','no');await m.saveLead(shop,f);assert.equal(await m.db.bookingEvent.count({where:{shop,kind:m.GOOGLE_ADS_ATTRIBUTION_KIND}}),0);
 const old=request('qualified');credentials=await m.createGoogleAdsFeed(shop);assert.equal((await m.googleAdsFeed(old,shop,'qualified')).status,401);await m.disableGoogleAdsFeed(shop);assert.equal((await m.googleAdsFeed(request('qualified'),shop,'qualified')).status,401);
});
}finally{await m.db.bookingMail.deleteMany({where:{shop}});await m.db.bookingEvent.deleteMany({where:{shop}});await m.db.bookingLead.deleteMany({where:{shop}});await m.db.weddingBooking.deleteMany({where:{shop}});await m.db.bookingSettings.deleteMany({where:{shop:{in:[shop,other]}}});await m.db.$disconnect();await rm('tests/.google-ads.mjs',{force:true});}
