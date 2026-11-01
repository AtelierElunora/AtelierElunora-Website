import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import db from "./db.server";
import { locked, details } from "./booking.server";
import { bookingRecipientAllowed } from "./live-store";
import { emailProvider } from "./email-provider.server";
import { bookingEmail } from "./booking-email";
import { inquiryToken } from "./lead-access.server";
import { DAY, followupConfig, followupId, followupKinds, followupSuccess, followupFailures, inquiryGroups } from "./lead-followup";
type Tx=Prisma.TransactionClient;

async function groups(tx:Tx,shop:string,now:Date) {
  const leads=await tx.bookingLead.findMany({where:{shop,createdAt:{gte:new Date(now.getTime()-30*DAY)}},orderBy:{createdAt:"asc"},take:5001});
  if(leads.length>5000) throw Error("Inquiry follow-up volume needs owner review.");
  return inquiryGroups(leads);
}
async function state(tx:Tx,shop:string,anchorId:string,now:Date) {
  const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop}}),config=followupConfig(settings.configJson);
  if(!config.enabled) return {paused:true} as const;
  const group=(await groups(tx,shop,now)).find(g=>g[0].id===anchorId);
  if(!group?.length) return null;
  const anchor=group[0],latest=[...group].reverse().find(l=>!!l.bookingId)||group.at(-1)!;
  if(anchor.createdAt.getTime()<Date.parse(config.since) || anchor.createdAt.getTime()<now.getTime()-7*DAY || group.some(l=>l.status!=="new" || l.contactedAt || !l.consentAt) || latest.weddingDate && latest.weddingDate<now.toISOString().slice(0,10)) return null;
  const bookings=await tx.weddingBooking.findMany({where:{shop,OR:[{id:{in:group.flatMap(l=>l.bookingId?[l.bookingId]:[])}},{customerEmail:latest.customerEmail,createdAt:{gte:anchor.createdAt}}]}});
  if(bookings.some(b=>b.paidCents>0 || b.status!=="hold" || details(b).emailSuppressed)) return null;
  // An uncertain payment might already have succeeded. Never chase it automatically.
  if(await tx.bookingPayment.count({where:{shop,bookingId:{in:bookings.map(b=>b.id)},OR:[{status:{in:["creating","review"]}},{orderId:{not:null}},{receivedCents:{gt:0}}]}})) return null;
  if(await tx.bookingMail.count({where:{shop,bookingId:anchorId,kind:{in:followupKinds},status:{in:["bounced","complained","suppressed","failed","review"]}}})) return null;
  const firstAt=new Date(Math.max(anchor.createdAt.getTime()+DAY,...group.map(l=>l.followUpAt?.getTime()||0)));
  return {paused:false,group,anchor,latest,firstAt} as const;
}
export async function scheduleLeadFollowups(shop:string,now=new Date()) {
  return locked(shop,async tx=>{
    const config=followupConfig((await tx.bookingSettings.findUniqueOrThrow({where:{shop}})).configJson);
    if(!config.enabled)return;
    for(const group of await groups(tx,shop,now)) {
      const current=await state(tx,shop,group[0].id,now);
      if(!current || current.paused)continue;
      for(const stage of [1,2] as const) {
        const id=followupId(current.anchor.id,stage);
        await tx.bookingMail.upsert({where:{id},create:{id,shop,bookingId:current.anchor.id,kind:followupKinds[stage-1],sendAt:stage===1?current.firstAt:new Date(Math.max(current.firstAt.getTime()+2*DAY,current.anchor.createdAt.getTime()+3*DAY)),operationId:randomUUID()},update:{}});
      }
    }
  });
}
export async function setFollowupEnabled(shop:string,enabled:boolean,now=new Date()) {
  await locked(shop,async tx=>{
    const s=await tx.bookingSettings.findUniqueOrThrow({where:{shop}}),c=JSON.parse(s.configJson);
    const prior=followupConfig(s.configJson);
    c.leadFollowup={enabled,since:prior.since||new Date(now.getTime()-2*DAY).toISOString()};
    await tx.bookingSettings.update({where:{shop},data:{configJson:JSON.stringify(c)}});
  });
  if(enabled)await scheduleLeadFollowups(shop,now);
}
export async function followupDashboard(shop:string) {
  const settings=await db.bookingSettings.findUniqueOrThrow({where:{shop}});
  const jobs=await db.bookingMail.findMany({where:{shop,kind:{in:followupKinds}},orderBy:{sendAt:"asc"},select:{id:true,bookingId:true,kind:true,sendAt:true,status:true},take:1000});
  const memberships=(await groups(db,shop,new Date())).flatMap(g=>g.map(l=>({id:l.id,anchorId:g[0].id})));
  return {config:followupConfig(settings.configJson),jobs,memberships};
}
export async function stopInquiryFollowups(shop:string,email:string) {
  await locked(shop,async tx=>{
    const leads=await tx.bookingLead.findMany({where:{shop,customerEmail:email}});
    await tx.bookingLead.updateMany({where:{shop,customerEmail:email},data:{status:"declined",followUpAt:null}});
    await tx.bookingMail.updateMany({where:{shop,bookingId:{in:leads.map(l=>l.id)},kind:{in:followupKinds},status:"pending"},data:{status:"suppressed"}});
  });
}
export async function runLeadFollowups(provider:ReturnType<typeof emailProvider>,sender:string,allowed:Set<string>,now=new Date(),scope?:{shop:string;anchorId?:string}) {
  for(const s of await db.bookingSettings.findMany({where:scope?{shop:scope.shop}:{}}))await scheduleLeadFollowups(s.shop,now);
  const jobs=await db.bookingMail.findMany({where:{...(scope?{shop:scope.shop,...(scope.anchorId?{bookingId:scope.anchorId}:{})}:{}),kind:{in:followupKinds},status:{in:["pending","accepted","sending"]},sendAt:{lte:now}},orderBy:{sendAt:"asc"},take:10});
  for(const job of jobs) {
    try {
    if(job.status!=="pending") {
      if(now.getTime()-job.updatedAt.getTime()<60000)continue;
      const saved=JSON.parse(job.payloadJson);
      if(!saved.email){await db.bookingMail.update({where:{id:job.id},data:{status:"review"}});continue;}
      if(job.status==="sending" && !saved.providerId) {
        const current=await locked(job.shop,tx=>state(tx,job.shop,job.bookingId,now));
        if(!current || current.paused){await db.bookingMail.update({where:{id:job.id},data:{status:"review"}});continue;}
      }
      const result=await provider.poll(saved.email,job.operationId,saved.providerId||null,saved.attemptAt||job.sendAt.toISOString());
      await db.bookingMail.update({where:{id:job.id},data:{status:result.status,payloadJson:JSON.stringify({...saved,providerId:result.providerId})}});
      if(["bounced","complained","suppressed"].includes(result.status))await stopInquiryFollowups(job.shop,saved.email.recipients.to[0].address);
      continue;
    }
    const payload=await locked(job.shop,async tx=>{
      const claimed=await tx.bookingMail.findUniqueOrThrow({where:{id:job.id}});
      if(claimed.status!=="pending")return null;
      const current=await state(tx,job.shop,job.bookingId,now);
      if(current?.paused)return null;
      if(!current){await tx.bookingMail.update({where:{id:job.id},data:{status:"suppressed"}});return null;}
      if(!bookingRecipientAllowed(job.shop,current.latest.customerEmail,allowed))return null;
      if(job.kind===followupKinds[0] && now<current.firstAt){await tx.bookingMail.update({where:{id:job.id},data:{sendAt:current.firstAt}});return null;}
      if(job.kind===followupKinds[1]) {
        const first=await tx.bookingMail.findUnique({where:{id:followupId(job.bookingId,1)}});
        if(!first || followupFailures.includes(first.status)) {await tx.bookingMail.update({where:{id:job.id},data:{status:"suppressed"}});return null;}
        if(!followupSuccess.includes(first.status))return null;
        const attempted=JSON.parse(first.payloadJson).attemptAt;
        if(!attempted || !Number.isFinite(Date.parse(attempted))) {await tx.bookingMail.update({where:{id:job.id},data:{status:"review"}});return null;}
        const due=new Date(Math.max(Date.parse(attempted)+2*DAY,current.firstAt.getTime()+2*DAY,current.anchor.createdAt.getTime()+3*DAY));
        if(now<due){await tx.bookingMail.update({where:{id:job.id},data:{sendAt:due}});return null;}
      }
      const lead=current.latest,origin=process.env.SHOPIFY_APP_URL;
      if(!origin || new URL(origin).protocol!=="https:")throw Error("A secure booking URL is required for inquiry follow-up.");
      const link=origin+"/inquiry/"+lead.id+"?token="+inquiryToken(lead,"resume",now.getTime());
      const stop=origin+"/inquiry/"+lead.id+"?stop="+inquiryToken(lead,"stop",now.getTime());
      const content=bookingEmail(job.kind,{customerName:lead.customerName,weddingDate:lead.weddingDate,balanceDueDate:null,totalCents:0,paidCents:0,status:"inquiry"},{currency:"USD",followupStopUrl:stop},link);
      const email={senderAddress:sender,recipients:{to:[{address:lead.customerEmail}]},content,replyTo:[{address:"support@atelierelunora.com",displayName:"Atelier Elunora"}],userEngagementTrackingDisabled:true};
      await tx.bookingMail.update({where:{id:job.id},data:{status:"sending",payloadJson:JSON.stringify({email,attemptAt:now.toISOString(),leadId:lead.id})}});
      return email;
    });
    if(!payload)continue;
    const result=await provider.send(payload,job.operationId);
    const saved=JSON.parse((await db.bookingMail.findUniqueOrThrow({where:{id:job.id}})).payloadJson);
    await db.bookingMail.update({where:{id:job.id},data:{status:result.status,payloadJson:JSON.stringify({...saved,providerId:result.providerId})}});
    } catch {
      await db.bookingMail.updateMany({where:{id:job.id,status:{in:["pending","sending","accepted"]}},data:{status:"review"}});
    }
  }
}
