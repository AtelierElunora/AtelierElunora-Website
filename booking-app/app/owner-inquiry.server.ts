import db from './db.server';
import {locked} from './booking.server';
import {parseConfig} from './booking-rules';
import {customerBookingAllowed} from './live-store';
import {OWNER_INQUIRY_KIND,OWNER_INQUIRY_RECIPIENT} from './owner-inquiry';
import {ownerInquiryEmail} from './owner-inquiry-email';
import type {emailProvider} from './email-provider.server';
export async function runOwnerInquiryNotifications(provider:ReturnType<typeof emailProvider>,sender:string,now=new Date(),scope?:{shop:string;leadId?:string}) {
 const jobs=await db.bookingMail.findMany({where:{kind:OWNER_INQUIRY_KIND,status:{in:['pending','sending','accepted']},sendAt:{lte:now},...(scope?{shop:scope.shop,...(scope.leadId?{bookingId:scope.leadId}:{})}:{})},orderBy:{sendAt:'asc'},take:10});
 for(const job of jobs)try{
  if(!customerBookingAllowed(job.shop)){await db.bookingMail.update({where:{id:job.id},data:{status:'suppressed'}});continue;}
  if(job.status!=='pending'){
   if(now.getTime()-job.updatedAt.getTime()<60000)continue;
   const saved=JSON.parse(job.payloadJson);
   if(!saved.email || saved.email.recipients?.to?.length!==1 || saved.email.recipients.to[0].address!==OWNER_INQUIRY_RECIPIENT){await db.bookingMail.update({where:{id:job.id},data:{status:'review'}});continue;}
   const result=await provider.poll(saved.email,job.operationId,saved.providerId||null,saved.attemptAt||job.sendAt.toISOString());
   await db.bookingMail.update({where:{id:job.id},data:{status:result.status,payloadJson:JSON.stringify({...saved,providerId:result.providerId})}});continue;
  }
  const payload=await locked(job.shop,async tx=>{
   const current=await tx.bookingMail.findUniqueOrThrow({where:{id:job.id}});
   if(current.status!=='pending')return null;
   const lead=await tx.bookingLead.findFirst({where:{id:job.bookingId,shop:job.shop}});
   if(!lead){await tx.bookingMail.update({where:{id:job.id},data:{status:'suppressed'}});return null;}
   const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop:job.shop}});
   const collection=parseConfig(settings.configJson).packages.find(p=>p.id===lead.packageId)?.name||'';
   const email={senderAddress:sender,recipients:{to:[{address:OWNER_INQUIRY_RECIPIENT}]},content:ownerInquiryEmail(lead,collection),replyTo:[{address:lead.customerEmail,displayName:lead.customerName.replace(/[\r\n\t]+/g,' ').slice(0,100)}],userEngagementTrackingDisabled:true};
   await tx.bookingMail.update({where:{id:job.id},data:{status:'sending',payloadJson:JSON.stringify({email,attemptAt:now.toISOString()})}});
   return email;
  });
  if(!payload)continue;
  const result=await provider.send(payload,job.operationId);
  const saved=JSON.parse((await db.bookingMail.findUniqueOrThrow({where:{id:job.id}})).payloadJson);
  await db.bookingMail.update({where:{id:job.id},data:{status:result.status,payloadJson:JSON.stringify({...saved,providerId:result.providerId})}});
 }catch{await db.bookingMail.updateMany({where:{id:job.id,status:{in:['pending','sending','accepted']}},data:{status:'review'}});}
}
