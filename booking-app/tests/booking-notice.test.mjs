import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error('Use disposable SQLite only.');
await build({stdin:{contents:"export * from './tests/server-entry';export * from './app/booking-rules';export {BookingCalendar} from './app/BookingCalendar';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:'tests/.booking-notice-bundle.mjs'});
const {db,bookingToday,minimumWeddingDate,requireBookingNotice,parseConfig,dueDate,BookingCalendar,createBooking,details,updateBooking,requestBookingChange,reservePayment}=await import('./.booking-notice-bundle.mjs');
const shop='notice-'+randomUUID()+'.myshopify.com',config=parseConfig('{}'),today=bookingToday(),at=n=>dueDate(today,-n);
const input={name:'Synthetic notice test',email:'notice@example.invalid',venue:'Test venue',weddingDate:at(40),guests:50,addons:{},totalCents:10000,accepted:true,source:'owner'};
try{
await test('minimum notice uses inclusive 14-calendar-day boundary in Ohio, including midnight and DST',()=>{
 const now=Date.parse('2026-10-25T01:30:00Z');
 assert.equal(bookingToday(now),'2026-10-24');assert.equal(minimumWeddingDate(config,now),'2026-11-07');
 assert.throws(()=>requireBookingNotice(config,'2026-11-06',now),/at least 14 days/);
 assert.doesNotThrow(()=>requireBookingNotice(config,'2026-11-07',now));
 assert.equal(minimumWeddingDate(config,Date.parse('2026-10-25T04:00:00Z')),'2026-11-08');
 assert.equal(minimumWeddingDate(config,Date.parse('2027-03-07T17:00:00Z')),'2027-03-21');
 assert.equal(minimumWeddingDate(config,Date.parse('2028-02-20T17:00:00Z')),'2028-03-05');
});
await test('notice defaults to 14 and only accepts bounded whole-day settings',()=>{
 assert.equal(config.minimumNoticeDays,14);
 for(const minimumNoticeDays of [-1,1.5,731,'14',null])assert.throws(()=>parseConfig(JSON.stringify({minimumNoticeDays})),/whole number/);
 assert.equal(parseConfig('{"minimumNoticeDays":30}').minimumNoticeDays,30);
 assert.equal(minimumWeddingDate(parseConfig('{"minimumNoticeDays":0}'),Date.parse('2026-10-24T17:00Z')),'2026-10-24');
});
await test('waitlist selection cannot bypass notice; calendar starts at the first bookable month',()=>{
 const availability=[{date:'2026-10-24',open:false,noticeAllowed:false},{date:'2026-11-06',open:false,noticeAllowed:false},{date:'2026-11-07',open:true,noticeAllowed:true},{date:'2026-11-08',open:false,noticeAllowed:true}];
 const html=renderToStaticMarkup(React.createElement(BookingCalendar,{availability,allowUnavailable:true}));
 assert.match(html,/November 2026/);
 const button=label=>html.match(new RegExp('<button[^>]*aria-label="'+label+'"[^>]*>'))?.[0];
 assert.match(button('2026-11-06 unavailable'),/disabled/);
 assert.doesNotMatch(button('2026-11-07 request waitlist'),/disabled/);
 assert.doesNotMatch(button('2026-11-08 request waitlist'),/disabled/);
});
await db.bookingSettings.create({data:{shop,dailyCapacity:5,agreementText:'Synthetic test terms'}});
await test('server rejects short-notice normal, quote, waitlist and owner bookings before creating records',async()=>{
 const before=await db.weddingBooking.count({where:{shop}});
 for(const days of [1,13])for(const change of [{},{source:'customer',contractRequested:true},{source:'customer',quoteRequest:true},{source:'customer',waitlist:true}])await assert.rejects(createBooking(shop,{...input,...change,weddingDate:at(days)}),/at least 14 days/);
 assert.equal(await db.weddingBooking.count({where:{shop}}),before);
 const created=await createBooking(shop,{...input,weddingDate:at(14)});assert.equal(created.booking.weddingDate,at(14));
});
await test('reschedule requests and owner changes enforce notice while existing balances remain payable',async()=>{
 const {booking}=await createBooking(shop,input);
 await db.weddingBooking.update({where:{id:booking.id},data:{status:'confirmed',paidCents:3000}});
 const form=date=>new URLSearchParams({changeKind:'reschedule',date,reason:'Synthetic request'});
 await assert.rejects(requestBookingChange(shop,booking.id,form(at(13))),/at least 14 days/);
 await assert.rejects(updateBooking(shop,booking.id,'reschedule',new URLSearchParams({date:at(1)})),/at least 14 days/);
 await requestBookingChange(shop,booking.id,form(at(14)));
 let saved=await db.weddingBooking.findUniqueOrThrow({where:{id:booking.id}});
 assert.equal(saved.weddingDate,at(40));assert.equal(details(saved).changeRequest.date,at(14));
 await updateBooking(shop,booking.id,'approve_change',new URLSearchParams({requestId:details(saved).changeRequest.id}));
 assert.equal((await db.weddingBooking.findUniqueOrThrow({where:{id:booking.id}})).weddingDate,at(14));
 // A previously confirmed event nearing its date still needs balance collection.
 await db.weddingBooking.update({where:{id:booking.id},data:{weddingDate:at(1)}});
 assert.equal((await reservePayment(shop,booking.id,'balance')).amountCents,7000);
});
await test('expired unpaid holds cannot renew into a short-notice booking',async()=>{
 const {booking}=await createBooking(shop,{...input,weddingDate:at(30)}),d=details(booking);
 d.holdExpiresAt=new Date(Date.now()-60000).toISOString();
 await db.weddingBooking.update({where:{id:booking.id},data:{weddingDate:at(1),detailsJson:JSON.stringify(d)}});
 await assert.rejects(reservePayment(shop,booking.id,'prepayment'),/at least 14 days/);
 assert.equal(await db.bookingPayment.count({where:{bookingId:booking.id}}),0);
});
}finally{
 for(const model of ['bookingMail','bookingWebhook','bookingEvent','bookingPayment','weddingBooking','bookingSettings'])await db[model].deleteMany({where:{shop}});
 await db.$disconnect();await rm('tests/.booking-notice-bundle.mjs',{force:true});
}
