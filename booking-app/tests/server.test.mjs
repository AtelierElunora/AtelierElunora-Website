import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error('Server tests require the local SQLite backend.');
await build({entryPoints:['tests/server-entry.ts'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:'tests/.server-bundle.mjs'});
const {db,createBooking,invoice,refreshPayment,refreshBookingPayments,updateBooking,portalBooking,details,parseImport,importBookings,importFingerprint,reminderDrafts,requestBookingChange,acceptQuote,calendarFeedLoader,hash,scheduleMail,bookingEmail,signBookingContract,reservePayment,countersignBookingContract}=await import('./.server-bundle.mjs');
const shop='test-'+randomUUID()+'.myshopify.com';
const input={name:'Synthetic test',email:'test@example.invalid',venue:'Test venue',weddingDate:'2027-06-01',guests:50,addons:{},totalCents:100000,accepted:true,source:'owner'};
try{await db.bookingSettings.create({data:{shop,dailyCapacity:2,agreementText:'Test agreement'}});
let b,t,p,order,draftCounter=123;
const fakeAdmin={graphql:async(q,{variables})=>{if(q.includes('draftOrderCreate')){assert.ok(variables.input.tags.every(t=>t.length<=40),'Shopify draft-order tags must fit 40 characters');draftCounter++;const attrs=variables.input.customAttributes;const amount=variables.input.lineItems[0].originalUnitPriceWithCurrency.amount;return Response.json({data:{draftOrderCreate:{draftOrder:{id:'gid://shopify/DraftOrder/'+draftCounter,invoiceUrl:'https://checkout.shopify.com/test',totalPriceSet:{presentmentMoney:{amount,currencyCode:'USD'}}},userErrors:[]}}});}if(q.includes('draftOrder(id:'))return Response.json({data:{draftOrder:{id:'gid://shopify/DraftOrder/123',order:{id:'gid://shopify/Order/'+variables.id.split('/').pop()}}}});const target=await db.bookingPayment.findUniqueOrThrow({where:{id:order.customAttributes.find(a=>a.key==='elunora_payment_id').value}});const price={presentmentMoney:{amount:(target.amountCents/100).toFixed(2),currencyCode:'USD'}},zero={presentmentMoney:{amount:'0.00',currencyCode:'USD'}};return Response.json({data:{order:{taxesIncluded:false,lineItems:{nodes:[{quantity:1,originalUnitPriceSet:price}]},totalPriceSet:price,totalTaxSet:zero,currentTotalTaxSet:zero,totalDiscountsSet:zero,...order}}});}};
await test('confirmation email distinguishes prepayment from full payment without an empty deadline',()=>{
 const booking={customerName:'Alex & Jordan',weddingDate:'2027-07-24',balanceDueDate:'2027-06-24',totalCents:199500,paidCents:59850,status:'confirmed'};
 const partial=bookingEmail('confirmation',booking,{currency:'USD'},'https://example.invalid/booking');
 assert.match(partial.plainText,/Payment received: \$598.50/);assert.match(partial.plainText,/Remaining balance: \$1,396.50/);assert.ok(!partial.html.includes('Paid in full'));
 const full=bookingEmail('confirmation',{...booking,paidCents:199500,balanceDueDate:null},{currency:'USD'},'https://example.invalid/booking');
 assert.match(full.plainText,/Remaining balance: Paid in full/);assert.ok(!full.plainText.includes('Balance due'));assert.ok(!full.html.includes('null'));assert.match(full.html,/Alex &amp; Jordan/);
});
await test('gallery invitation uses the signed-in event gallery instead of a payment token',()=>{
 const url='https://api-elunora-production-nvo32m3ban2cc.azurewebsites.net/api/gallery-preview/?event=11111111-1111-4111-8111-111111111111';
 const mail=bookingEmail('gallery',{customerName:'Synthetic <client>',weddingDate:'2027-09-19',balanceDueDate:'2027-08-20',totalCents:199500,paidCents:59850,status:'confirmed'},{currency:'USD',gallery:{url}},'https://example.invalid/private-token');
 assert.match(mail.html,/Synthetic &lt;client&gt;/);assert.match(mail.plainText,/Booking tab/);assert.ok(mail.plainText.includes(url));assert.ok(!mail.plainText.includes('private-token'));assert.ok(!mail.html.includes('expires in 30 days'));
});
await test('date hold, private portal, agreement snapshot and independent capacity',async()=>{const created=await createBooking(shop,input);b=created.booking;t=created.portalToken;assert.equal((await portalBooking(b.id,t)).id,b.id);await assert.rejects(portalBooking(b.id,'0'.repeat(64)));assert.equal(details(b).agreement.text,'Test agreement');await createBooking(shop,{...input,name:'Second'});await assert.rejects(createBooking(shop,{...input,name:'Third'}),/fully booked/);});
await test('real route service creates 30% invoice and reconciles replay/refunds once',async()=>{assert.equal(await invoice(fakeAdmin,shop,b.id,'prepayment'),'https://checkout.shopify.com/test');p=await db.bookingPayment.findFirstOrThrow({where:{bookingId:b.id}});assert.equal(p.amountCents,30000);order={id:'gid://shopify/Order/'+p.draftOrderId.split('/').pop(),updatedAt:'2026-10-06T18:00:00Z',customAttributes:[{key:'elunora_booking_id',value:b.id},{key:'elunora_payment_id',value:p.id}],totalReceivedSet:{presentmentMoney:{amount:'300.00',currencyCode:'USD'}},totalRefundedSet:{presentmentMoney:{amount:'0.00',currencyCode:'USD'}}};await refreshPayment(fakeAdmin,shop,p.id);await refreshPayment(fakeAdmin,shop,p.id);let saved=await db.weddingBooking.findUniqueOrThrow({where:{id:b.id}});assert.equal(saved.paidCents,30000);assert.equal(saved.totalCents-saved.paidCents,70000);assert.equal(saved.status,'confirmed');assert.equal(details(saved).paymentStatus,'partially_paid');order={...order,updatedAt:'2026-10-06T19:00:00Z',totalRefundedSet:{presentmentMoney:{amount:'50.00',currencyCode:'USD'}}};await refreshPayment(fakeAdmin,shop,p.id);saved=await db.weddingBooking.findUniqueOrThrow({where:{id:b.id}});assert.equal(saved.paidCents,25000);});
await test('balance collection covers only net amount remaining and marks full only after verification',async()=>{await invoice(fakeAdmin,shop,b.id,'balance');const balance=await db.bookingPayment.findFirstOrThrow({where:{bookingId:b.id,kind:'balance'}});assert.equal(balance.amountCents,75000);order={id:'gid://shopify/Order/'+balance.draftOrderId.split('/').pop(),updatedAt:'2026-10-06T20:00:00Z',customAttributes:[{key:'elunora_booking_id',value:b.id},{key:'elunora_payment_id',value:balance.id}],totalReceivedSet:{presentmentMoney:{amount:'750.00',currencyCode:'USD'}},totalRefundedSet:{presentmentMoney:{amount:'0.00',currencyCode:'USD'}}};await refreshPayment(fakeAdmin,shop,balance.id);const saved=await db.weddingBooking.findUniqueOrThrow({where:{id:b.id}});assert.equal(saved.paidCents,100000);assert.equal(details(saved).paymentStatus,'paid_in_full');await assert.rejects(invoice(fakeAdmin,shop,b.id,'balance'),/No payment/);});
await test('an unavailable historical order does not prevent newer balance verification',async()=>{const old=await db.bookingPayment.findUniqueOrThrow({where:{id:p.id}});const historicalAdmin={graphql:async(q,o)=>{if(q.includes('order(id:')&&o.variables.id===old.orderId)throw Error('Historical order unavailable');return fakeAdmin.graphql(q,o);}};const message=await refreshBookingPayments(historicalAdmin,shop,b.id);assert.match(message,/1 payment record/);assert.equal((await db.weddingBooking.findUniqueOrThrow({where:{id:b.id}})).paidCents,100000);});
await test('reschedule changes due date, audit and cancellation releases capacity',async()=>{const f=new FormData();f.set('date','2027-07-01');await updateBooking(shop,b.id,'reschedule',f);const saved=await db.weddingBooking.findUniqueOrThrow({where:{id:b.id}});assert.equal(saved.balanceDueDate,'2027-06-01');await updateBooking(shop,b.id,'cancel',new FormData());assert.equal((await db.weddingBooking.findUniqueOrThrow({where:{id:b.id}})).status,'cancelled');assert.ok((await db.bookingEvent.count({where:{bookingId:b.id}}))>=4);});
await test('customer details cannot bypass the booked package guest limit',async()=>{await db.bookingSettings.update({where:{shop},data:{configJson:JSON.stringify({packages:[{id:'limited',name:'Limited test package',priceCents:1000,maxGuests:100}]})}});const created=await createBooking(shop,{...input,totalCents:undefined,packageId:'limited',weddingDate:'2027-08-01',source:'customer',phone:'+1 555 0100',preferredStartTime:'5 PM',customerNotes:'Synthetic access note',paymentChoice:'full'});assert.equal(details(created.booking).phone,'+1 555 0100');assert.equal(details(created.booking).preferredStartTime,'5 PM');assert.equal(details(created.booking).customerNotes,'Synthetic access note');assert.equal(details(created.booking).paymentChoice,'full');await assert.rejects(updateBooking(shop,created.booking.id,'details',new URLSearchParams({finalGuests:'101'})),/package limit/);await updateBooking(shop,created.booking.id,'details',new URLSearchParams({finalGuests:'100'}));assert.equal(details(await db.weddingBooking.findUniqueOrThrow({where:{id:created.booking.id}})).finalGuests,'100');});
await test('guest collection upgrade is explicit and the server recalculates its price',async()=>{
 await db.bookingSettings.update({where:{shop},data:{configJson:JSON.stringify({packages:[{id:'small',name:'Up to 150',priceCents:149500,maxGuests:150},{id:'large',name:'151–200',priceCents:199500,maxGuests:200}]})}});
 const request={...input,totalCents:undefined,guests:155,weddingDate:'2027-08-02',source:'customer'};
 await assert.rejects(createBooking(shop,{...request,packageId:'small'}),/supports your guest count/);
 const upgraded=await createBooking(shop,{...request,packageId:'large'});
 assert.equal(upgraded.booking.totalCents,199500);
});
await test('waitlist does not occupy capacity or collect payment and invitation checks capacity',async()=>{const first=await createBooking(shop,{...input,weddingDate:'2027-09-01'});const second=await createBooking(shop,{...input,weddingDate:'2027-09-01'});const requested=await createBooking(shop,{...input,weddingDate:'2027-09-01',waitlist:true,accepted:false,source:'customer'});assert.equal(requested.booking.status,'waitlist');await assert.rejects(invoice(fakeAdmin,shop,requested.booking.id,'full'),/owner review/);await assert.rejects(updateBooking(shop,requested.booking.id,'invite',new FormData()),/fully booked/);await updateBooking(shop,first.booking.id,'cancel',new FormData());await updateBooking(shop,requested.booking.id,'invite',new FormData());assert.equal((await db.weddingBooking.findUniqueOrThrow({where:{id:requested.booking.id}})).status,'hold');});
await test('quote review blocks invoices, stale acceptance and conflicting dates',async()=>{
const requested=await createBooking(shop,{...input,weddingDate:'2027-10-01',source:'customer',quoteRequest:true,accepted:false});
assert.equal(requested.booking.status,'quote_review');
await assert.rejects(invoice(fakeAdmin,shop,requested.booking.id,'full'),/owner review/);
await updateBooking(shop,requested.booking.id,'offer_quote',new URLSearchParams({base:'1000.00',travel:'50.00',quoteNotes:'Synthetic travel approval'}));
let saved=await db.weddingBooking.findUniqueOrThrow({where:{id:requested.booking.id}});
assert.equal(saved.totalCents,105000);assert.equal(saved.status,'quote_offered');
await assert.rejects(acceptQuote(shop,saved.id,new URLSearchParams({accepted:'yes',revision:'0'})),/quote changed/);
await acceptQuote(shop,saved.id,new URLSearchParams({accepted:'yes',revision:'1'}));
saved=await db.weddingBooking.findUniqueOrThrow({where:{id:saved.id}});assert.equal(saved.status,'hold');assert.equal(details(saved).quoteReview.status,'accepted');
await assert.rejects(acceptQuote(shop,saved.id,new URLSearchParams({accepted:'yes',revision:'1'})),/quote changed/);
});
await test('customer change requests retain dates, enforce cutoff and require reviewed request identity',async()=>{
const created=await createBooking(shop,{...input,weddingDate:'2028-02-01'});await db.weddingBooking.update({where:{id:created.booking.id},data:{status:'confirmed'}});
const form=new URLSearchParams({changeKind:'reschedule',date:'2028-03-01',reason:'Synthetic date change'});
await requestBookingChange(shop,created.booking.id,form);let saved=await db.weddingBooking.findUniqueOrThrow({where:{id:created.booking.id}});assert.equal(saved.weddingDate,'2028-02-01');
await assert.rejects(requestBookingChange(shop,saved.id,form),/already awaiting/);
await assert.rejects(updateBooking(shop,saved.id,'approve_change',new URLSearchParams({requestId:'stale'})),/no longer pending/);
await updateBooking(shop,saved.id,'approve_change',new URLSearchParams({requestId:details(saved).changeRequest.id}));saved=await db.weddingBooking.findUniqueOrThrow({where:{id:saved.id}});assert.equal(saved.weddingDate,'2028-03-01');assert.equal(saved.balanceDueDate,'2028-01-31');
await requestBookingChange(shop,saved.id,new URLSearchParams({changeKind:'cancel',reason:'Synthetic cancellation'}));saved=await db.weddingBooking.findUniqueOrThrow({where:{id:saved.id}});
await updateBooking(shop,saved.id,'decline_change',new URLSearchParams({requestId:details(saved).changeRequest.id}));assert.equal((await db.weddingBooking.findUniqueOrThrow({where:{id:saved.id}})).status,'confirmed');
const d=details(saved);d.changePolicy.cutoffDays=730;await db.weddingBooking.update({where:{id:saved.id},data:{detailsJson:JSON.stringify(d)}});await assert.rejects(requestBookingChange(shop,saved.id,form),/saved policy/);
});
await test('calendar subscription excludes holds, authenticates tokens and honors revocation',async()=>{
const raw='a'.repeat(64),settings=await db.bookingSettings.findUniqueOrThrow({where:{shop}}),c=JSON.parse(settings.configJson);c.calendarFeed={hash:hash(raw),expiresAt:new Date(Date.now()+86400000).toISOString()};await db.bookingSettings.update({where:{shop},data:{configJson:JSON.stringify(c)}});
const request=new Request(`https://booking.example.invalid/calendar-feed/${shop}?token=${raw}`),params={shop};
const response=await calendarFeedLoader({request,params});assert.equal(response.headers.get('Cache-Control'),'no-store');const text=await response.text();assert.ok(text.includes('BEGIN:VCALENDAR'));assert.ok(text.includes('STATUS:CONFIRMED'));assert.ok(!text.includes('STATUS:TENTATIVE'));assert.ok(text.includes('STATUS:CANCELLED'));
await assert.rejects(calendarFeedLoader({request:new Request(`https://booking.example.invalid/calendar-feed/${shop}?token=${'b'.repeat(64)}`),params}),e=>e.status===404);
c.calendarFeed=null;await db.bookingSettings.update({where:{shop},data:{configJson:JSON.stringify(c)}});await assert.rejects(calendarFeedLoader({request,params}),e=>e.status===404);
});
await test('quote/change notifications are durable, unique and accurately distinguish confirmation from review',async()=>{
const requested=await createBooking(shop,{...input,weddingDate:'2027-11-01',quoteRequest:true});await updateBooking(shop,requested.booking.id,'offer_quote',new URLSearchParams({base:'1000.00',travel:'75.00',quoteNotes:'Synthetic travel quote <script>'}));await scheduleMail(shop);await scheduleMail(shop);assert.equal(await db.bookingMail.count({where:{bookingId:requested.booking.id,kind:'quote'}}),1);
const saved=await db.weddingBooking.findUniqueOrThrow({where:{id:requested.booking.id}}),message=bookingEmail('quote',saved,details(saved),'https://booking.example.invalid/private');assert.match(message.plainText,/not reserved/);assert.match(message.plainText,/1,075.00/);assert.ok(!message.html.includes('<script>'));assert.match(message.html,/&lt;script&gt;/);
const cancelled=bookingEmail('change',{...saved,status:'cancelled'}, {...details(saved),changeRequest:{kind:'cancel',status:'approved'}},'https://booking.example.invalid/private');assert.match(cancelled.plainText,/No refund has been transferred/);
});
await test('alternative date requires customer acceptance and rejects stale or unavailable offers',async()=>{
const created=await createBooking(shop,{...input,weddingDate:'2028-05-01'});const id=created.booking.id;await db.weddingBooking.update({where:{id},data:{status:'confirmed'}});
await requestBookingChange(shop,id,new URLSearchParams({changeKind:'reschedule',date:'2028-05-02',reason:'Test'}));let saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});const requestId=details(saved).changeRequest.id;
await updateBooking(shop,id,'offer_date',new URLSearchParams({requestId,offeredDate:'2028-05-03'}));saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});assert.equal(saved.weddingDate,'2028-05-01');assert.equal(details(saved).changeRequest.status,'offered');
await assert.rejects(updateBooking(shop,id,'accept_date',new URLSearchParams({requestId})),/no longer pending/);
await scheduleMail(shop);assert.equal(await db.bookingMail.count({where:{bookingId:id,kind:'change'}}),1);
const currentId=details(saved).changeRequest.id;await createBooking(shop,{...input,weddingDate:'2028-05-03'});await createBooking(shop,{...input,weddingDate:'2028-05-03'});
await assert.rejects(updateBooking(shop,id,'accept_date',new URLSearchParams({requestId:currentId})),/fully booked/);assert.equal((await db.weddingBooking.findUniqueOrThrow({where:{id}})).weddingDate,'2028-05-01');
await updateBooking(shop,id,'offer_date',new URLSearchParams({requestId:currentId,offeredDate:'2028-05-04'}));saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});await updateBooking(shop,id,'accept_date',new URLSearchParams({requestId:details(saved).changeRequest.id}));saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});assert.equal(saved.weddingDate,'2028-05-04');assert.equal(details(saved).changeRequest.status,'approved');await scheduleMail(shop);assert.equal(await db.bookingMail.count({where:{bookingId:id,kind:'change'}}),2);
});
await test('CSV preview/import preserves opening payments and rejects duplicate batches',async()=>{const text='external_id,name,email,date,venue,total,paid,balance_due\nlegacy-1,Test,test@example.invalid,2027-08-01,Venue,1000.00,300.00,2027-07-02';assert.equal(parseImport(text)[0].paidCents,30000);await assert.rejects(importBookings(shop,text,'wrong'),/Preview/);assert.equal(await importBookings(shop,text,importFingerprint(text)),1);await assert.rejects(importBookings(shop,text,importFingerprint(text)),/Already imported/);const imported=await db.weddingBooking.findFirstOrThrow({where:{shop,customerName:"Test",weddingDate:"2027-08-01"}});const draft=(await reminderDrafts(shop)).filter(r=>r.bookingId===imported.id);assert.equal(draft.length,4);assert.match(draft[0].text,/\$700.00/);});

await test('online contracts gate invoices, persist one signature, retain amendments and protect private access',async()=>{
 await db.bookingSettings.update({where:{shop},data:{agreementText:"Owner booking and cancellation terms.",prepaymentPercent:30,balanceDaysBefore:30,configJson:"{}"}});
 const online=await createBooking(shop,{...input,weddingDate:"2030-06-01",source:"customer",accepted:false,contractRequested:true});
 const id=online.booking.id,privateToken=online.portalToken;
 let saved=await db.weddingBooking.findUniqueOrThrow({where:{id}}),d=details(saved);
 assert.equal(d.agreement.acceptedAt,null);assert.equal(d.agreement.contract.signature,null);assert.equal(d.agreement.contract.document.prepaymentCents,30000);
 await assert.rejects(reservePayment(shop,id,"prepayment"),/Sign/);
 const signing=new URLSearchParams({contractHash:d.agreement.contract.hash,signatureName:"Synthetic Signer",signatureConsent:"yes"});
 await assert.rejects(signBookingContract(shop,id,signing,"f".repeat(64)),/link/);
 await assert.rejects(signBookingContract(shop+"-other",id,signing,privateToken));
 await signBookingContract(shop,id,signing,privateToken,"Test browser");const original=details(await db.weddingBooking.findUniqueOrThrow({where:{id}})).agreement.contract;
 await signBookingContract(shop,id,signing,privateToken,"Test browser");
 assert.equal(await db.bookingEvent.count({where:{shop,bookingId:id,kind:"agreement"}}),1);
 saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});assert.equal(saved.paidCents,0);assert.equal(saved.status,"hold");
 const reserved=await reservePayment(shop,id,"prepayment");assert.equal(reserved.amountCents,30000);
 await assert.rejects(updateBooking(shop,id,"reschedule",new URLSearchParams({date:"2030-06-02"})),/Void/);
 await db.bookingPayment.update({where:{id:reserved.id},data:{status:"void"}});
 await updateBooking(shop,id,"reschedule",new URLSearchParams({date:"2030-06-02"}));
 d=details(await db.weddingBooking.findUniqueOrThrow({where:{id}}));
 assert.equal(d.agreement.contract.signature,null);assert.equal(d.agreement.acceptedAt,null);assert.equal(d.agreement.contractHistory[0].hash,original.hash);
 await assert.rejects(signBookingContract(shop,id,signing,privateToken),/changed/);
 await assert.rejects(reservePayment(shop,id,"balance"),/Sign/);
 const latest=new URLSearchParams({contractHash:d.agreement.contract.hash,signatureName:"Synthetic Signer",signatureConsent:"yes"});
 d.portalExpiresAt=new Date(Date.now()-1000).toISOString();d.emailPortalLinks=[];await db.weddingBooking.update({where:{id},data:{detailsJson:JSON.stringify(d)}});
 await assert.rejects(signBookingContract(shop,id,latest,privateToken),/link/);
});
await test('approved quotes require the exact generated contract signature before holding a date',async()=>{
 const proposed=await createBooking(shop,{...input,weddingDate:"2030-07-01",source:"customer",accepted:false,contractRequested:true,quoteRequest:true});
 const id=proposed.booking.id,privateToken=proposed.portalToken;
 await updateBooking(shop,id,"offer_quote",new URLSearchParams({base:"1200.00",travel:"100.00",quoteNotes:"Approved test travel"}));
 let saved=await db.weddingBooking.findUniqueOrThrow({where:{id}}),d=details(saved);
 const f=new URLSearchParams({accepted:"yes",revision:String(d.quoteReview.revision)});
 await assert.rejects(acceptQuote(shop,id,f,privateToken),/changed/);
 saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});assert.equal(saved.status,"quote_offered");assert.equal(details(saved).agreement.contract.signature,null);
 await assert.rejects(signBookingContract(shop,id,f,privateToken),/owner review/);
 f.set("contractHash",d.agreement.contract.hash);f.set("signatureName","Synthetic Quote Signer");f.set("signatureConsent","yes");
 await acceptQuote(shop,id,f,privateToken,"Test browser");saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});d=details(saved);
 assert.equal(saved.status,"hold");assert.equal(saved.paidCents,0);assert.equal(d.agreement.contract.signature.documentHash,f.get("contractHash"));assert.equal(d.agreement.contract.document.totalCents,130000);
});

await test('owner can prepare an older unsigned booking while preserving earlier checkbox acceptance',async()=>{
 const legacy=await createBooking(shop,{...input,weddingDate:"2030-08-01",source:"owner",accepted:true});
 const id=legacy.booking.id,before=details(legacy.booking).agreement.acceptedAt;
 await updateBooking(shop,id,"prepare_contract",new URLSearchParams());
 const saved=await db.weddingBooking.findUniqueOrThrow({where:{id}}),d=details(saved);
 assert.equal(d.agreement.previousAcceptance.acceptedAt,before);assert.equal(d.agreement.acceptedAt,null);assert.equal(d.agreement.signatureRequired,true);assert.equal(d.agreement.contract.signature,null);assert.equal(saved.paidCents,0);
 await assert.rejects(reservePayment(shop,id,"prepayment"),/Sign/);
});

await test('full agreement snapshots, customer signature, owner countersign and invoice gates are transactional',async()=>{
 const profile={enabled:true,providerLegalName:"Sample Studio LLC",providerAddress:"1 Sample Lane",providerPhone:"+15555550100",providerEmail:"studio@example.invalid",backupDeletionPeriod:"No photo backups retained in this test.",additionalHourAddonId:""};
 await db.bookingSettings.update({where:{shop},data:{prepaymentPercent:30,agreementText:"Full agreement",configJson:JSON.stringify({eventAgreement:profile})}});
 const request={...input,weddingDate:"2031-07-01",source:"customer",contractRequested:true,accepted:false,phone:"+15555550101",preferredStartTime:"5 PM",agreementFields:{mailingAddress:"2 Sample Lane"}};
 await assert.rejects(createBooking(shop,{...request,agreementFields:{}}),/mailing address/);
 const made=await createBooking(shop,request),id=made.booking.id,token=made.portalToken;
 let saved=await db.weddingBooking.findUniqueOrThrow({where:{id}}),c=details(saved).agreement.contract;
 assert.equal(c.document.serviceAgreement.sections.length,20);
 await assert.rejects(reservePayment(shop,id,"full"),/Sign/);
 const f=new URLSearchParams({contractHash:c.hash,signatureName:"Sample Client",signatureStyle:"script",signatureConsent:"yes"});
 await signBookingContract(shop,id,f,token);
 await assert.rejects(reservePayment(shop,id,"full"),/countersign/);
 const provider=new URLSearchParams({contractHash:c.hash,providerName:"Sample Owner",providerTitle:"Owner",providerConsent:"yes"});
 await assert.rejects(countersignBookingContract("wrong.myshopify.com",id,provider));
 await assert.rejects(countersignBookingContract(shop,id,new URLSearchParams({...Object.fromEntries(provider),contractHash:"0".repeat(64)})),/current/);
 await countersignBookingContract(shop,id,provider);await countersignBookingContract(shop,id,provider);
 assert.equal(await db.bookingEvent.count({where:{shop,bookingId:id,kind:"provider_signature"}}),1);
 saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});c=details(saved).agreement.contract;assert.equal(saved.paidCents,0);assert.equal(saved.status,"hold");assert.equal(c.providerSignature.documentHash,c.hash);
 assert.equal(await invoice(fakeAdmin,shop,id,"prepayment"),"https://checkout.shopify.com/test");
 assert.equal((await db.bookingPayment.findFirstOrThrow({where:{bookingId:id}})).amountCents,30000);
 const amended=new URLSearchParams({contract_mailingAddress:"3 Changed Lane"});
 await assert.rejects(updateBooking(shop,id,"contract_details",amended),/Void pending/);
 const payment=await db.bookingPayment.findFirstOrThrow({where:{bookingId:id}});await db.bookingPayment.update({where:{id:payment.id},data:{status:"void"}});
 await updateBooking(shop,id,"contract_details",amended);saved=await db.weddingBooking.findUniqueOrThrow({where:{id}});
 assert.equal(details(saved).agreement.contract.signature,null);assert.ok(details(saved).agreement.contractHistory[0].providerSignature);
 await assert.rejects(reservePayment(shop,id,"full"),/Sign/);
 // A global profile change never rewrites the saved agreement for this booking.
 const raw=JSON.parse((await db.bookingSettings.findUniqueOrThrow({where:{shop}})).configJson);raw.eventAgreement.providerAddress="Changed global address";await db.bookingSettings.update({where:{shop},data:{configJson:JSON.stringify(raw)}});
 assert.equal(details(await db.weddingBooking.findUniqueOrThrow({where:{id}})).agreement.eventTemplate.providerAddress,"1 Sample Lane");
});

}finally{for(const model of ['bookingMail','bookingWebhook','bookingEvent','bookingPayment','weddingBooking','bookingSettings'])await db[model].deleteMany({where:{shop}});await db.$disconnect();await rm('tests/.server-bundle.mjs',{force:true});}
