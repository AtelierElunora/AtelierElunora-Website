import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error('Disposable SQLite required');
process.env.NODE_ENV='test';process.env.SHOPIFY_API_SECRET='synthetic-owner-test-secret';process.env.SHOPIFY_APP_URL='https://booking.example.invalid';
await build({stdin:{contents:`export {default as db} from './app/db.server';export * from './app/leads.server';export * from './app/owner-inquiry';export * from './app/owner-inquiry-email';export * from './app/owner-inquiry.server';export {runMail} from './app/mail.server';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'tests/.owner-inquiry.mjs',plugins:[{name:'fake-mail',setup(b){b.onResolve({filter:/email-provider\.server$/},()=>({path:'fake',namespace:'mail'}));b.onLoad({filter:/.*/,namespace:'mail'},()=>({contents:'export const emailProvider=()=>globalThis.__ownerEmailProvider;',loader:'js'}));}}]});
const m=await import('./.owner-inquiry.mjs'),shop='atelier-elunora-gallery-test.myshopify.com',ids=[];
const f=()=>{const v=new FormData();for(const[k,val]of Object.entries({leadToken:randomUUID(),name:'Synthetic Couple',email:'test@example.invalid',confirmEmail:'test@example.invalid',date:'2027-09-19',guests:'155',venue:'TEST ONLY venue',referralSource:'instagram',followUpConsent:'yes'}))v.set(k,val);return v;};
const leadFor=form=>m.db.bookingLead.findUniqueOrThrow({where:{tokenHash:createHash('sha256').update(form.get('leadToken')).digest('hex')}});
async function save(form=f()){await m.saveLead(shop,form);const lead=await leadFor(form);ids.push(lead.id);return lead;}
const sent=[];const provider={send:async(email,key)=>{sent.push({email,key});return{status:'submitted',providerId:key};},poll:async()=>({status:'review',providerId:null})};
const send=lead=>m.runOwnerInquiryNotifications(provider,'photos@mail.atelierelunora.com',new Date(),{shop,leadId:lead.id});
const job=lead=>m.db.bookingMail.findUniqueOrThrow({where:{id:m.ownerInquiryId(lead.id)}});
const settings=await m.db.bookingSettings.findUnique({where:{shop}});
try{
await m.db.bookingSettings.upsert({where:{shop},create:{shop,configJson:'{"packages":[],"addons":[]}'},update:{}});
await test('one durable notification per new inquiry, retries retain it and use latest details',async()=>{
 const form=f(),lead=await save(form);assert.equal((await job(lead)).status,'pending');form.set('venue','Updated test venue');await m.saveLead(shop,form);assert.equal(await m.db.bookingMail.count({where:{bookingId:lead.id,kind:m.OWNER_INQUIRY_KIND}}),1);
 await send(lead);await send(lead);assert.equal((await job(lead)).status,'submitted');assert.equal(sent.length,1);assert.deepEqual(sent[0].email.recipients.to,[{address:'support@atelierelunora.com'}]);assert.equal(sent[0].email.replyTo[0].address,'test@example.invalid');assert.match(sent[0].email.content.subject,/^\[TEST STORE\]/);assert.match(sent[0].email.content.plainText,/Updated test venue/);
});
await test('inquiry and notification commit atomically',async()=>{
 const form=f();await m.db.$executeRawUnsafe(`CREATE TRIGGER owner_notice_failure BEFORE INSERT ON BookingMail WHEN NEW.kind='owner_inquiry' BEGIN SELECT RAISE(ABORT,'Synthetic notification failure'); END;`);
 try{await assert.rejects(m.saveLead(shop,form));assert.equal(await m.db.bookingLead.count({where:{tokenHash:createHash('sha256').update(form.get('leadToken')).digest('hex')}}),0);}finally{await m.db.$executeRawUnsafe('DROP TRIGGER owner_notice_failure');}
});
await test('old inquiries are not backfilled and unsupported shops cannot generate owner alerts',async()=>{
 const form=f(),tokenHash=createHash('sha256').update(form.get('leadToken')).digest('hex');const old=await m.db.bookingLead.create({data:{shop,tokenHash,customerName:'Existing test',customerEmail:'test@example.invalid',consentAt:new Date()}});ids.push(old.id);await m.saveLead(shop,form);assert.equal(await m.db.bookingMail.count({where:{bookingId:old.id}}),0);assert.throws(()=>m.ownerInquiryLink('other.myshopify.com',old.id));
 const other=f();await m.saveLead('other.myshopify.com',other);const unsupported=await leadFor(other);ids.push(unsupported.id);assert.equal(await m.db.bookingMail.count({where:{bookingId:unsupported.id}}),0);
});
await test('concurrent workers claim one message and uncertain results never blindly resend',async()=>{
 const lead=await save(),before=sent.length;await Promise.all([send(lead),send(lead)]);assert.equal(sent.length,before+1);
 const uncertain=await save();let attempts=0;const fake={...provider,send:async()=>{attempts++;throw Error('uncertain network');}};await m.runOwnerInquiryNotifications(fake,'photos@mail.atelierelunora.com',new Date(),{shop,leadId:uncertain.id});await m.runOwnerInquiryNotifications(fake,'photos@mail.atelierelunora.com',new Date(),{shop,leadId:uncertain.id});assert.equal(attempts,1);assert.equal((await job(uncertain)).status,'review');
});
await test('contacted status does not cancel owner alerts; interrupted submissions require review',async()=>{
 const lead=await save();await m.db.bookingLead.update({where:{id:lead.id},data:{status:'contacted'}});await send(lead);assert.equal((await job(lead)).status,'submitted');
 const interrupted=await save();await m.db.bookingMail.update({where:{id:m.ownerInquiryId(interrupted.id)},data:{status:'sending',updatedAt:new Date(Date.now()-120000),payloadJson:JSON.stringify({email:sent.at(-1).email,attemptAt:new Date(Date.now()-120000).toISOString()})}});const before=sent.length;await send(interrupted);assert.equal(sent.length,before);assert.equal((await job(interrupted)).status,'review');
});
await test('normal mail worker dispatches owner alerts and Leads exposes status without payload',async()=>{
 const lead=await save();globalThis.__ownerEmailProvider=provider;process.env.BOOKING_EMAIL_ENABLED='true';process.env.BOOKING_EMAIL_SENDER='photos@mail.atelierelunora.com';await m.runMail();assert.equal((await job(lead)).status,'submitted');const listed=(await m.listLeads(shop)).find(x=>x.id===lead.id);assert.equal(listed.ownerNotification,'submitted');assert.equal(listed.payloadJson,undefined);
});
await test('email escapes input, sanitizes subject and includes fields and an authenticated admin link',async()=>{
 const lead={id:'synthetic-test',shop,customerName:'<script>alert(1)</script>\r\nBcc: bad',customerEmail:'test@example.invalid',weddingDate:'2027-09-19',guests:155,venue:'<b>Venue</b>',referralSource:'instagram',referralDetails:'',createdAt:new Date()};const email=m.ownerInquiryEmail(lead,'Test collection');assert.ok(!email.html.includes('<script>'));assert.ok(!email.html.includes('<b>Venue</b>'));assert.ok(!/[\r\n]/.test(email.subject));for(const value of ['155','Instagram','September 19, 2027','Test collection','lead=synthetic-test','prefers-color-scheme'])assert.ok(email.html.includes(value),value);assert.ok(!email.html.includes('/portal/'));assert.ok(!m.ownerInquiryEmail({...lead,shop:'v0j63n-ms.myshopify.com'}).subject.includes('TEST STORE'));
});
}finally{await m.db.bookingMail.deleteMany({where:{bookingId:{in:ids}}});await m.db.bookingLead.deleteMany({where:{id:{in:ids}}});if(!settings)await m.db.bookingSettings.deleteMany({where:{shop}});await m.db.$disconnect();await rm('tests/.owner-inquiry.mjs',{force:true});}
