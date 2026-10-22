import type {ActionFunctionArgs,LoaderFunctionArgs} from "react-router";
import {data,Form,redirect,useActionData,useLoaderData} from "react-router";
import db from "../db.server";
import {validInquiryToken} from "../lead-access.server";
import {stopInquiryFollowups} from "../lead-followup.server";
import {details,hash,locked,requireOrigin,token} from "../booking.server";
import {addEmailPortalLink} from "../portal-links";
const privateHeaders={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow"};
export const headers=()=>privateHeaders;
async function access(request:Request,id:string) {
  const url=new URL(request.url),purpose=url.searchParams.has("stop")?"stop":"resume",raw=url.searchParams.get(purpose==="stop"?"stop":"token")||"";
  const lead=await db.bookingLead.findUnique({where:{id}});
  if(!lead || !validInquiryToken(lead,raw,purpose))return null;
  return {lead,purpose,raw};
}
export async function loader({request,params}:LoaderFunctionArgs) {
  const a=await access(request,params.id!);
  if(!a)return data({expired:true,name:"",stop:false,closed:false,booking:false},{status:410,headers:privateHeaders});
  return data({expired:false,name:a.lead.customerName,stop:a.purpose==="stop",closed:a.lead.status==="declined",booking:!!a.lead.bookingId},{headers:privateHeaders});
}
export async function action({request,params}:ActionFunctionArgs) {
  requireOrigin(request);
  const a=await access(request,params.id!);
  if(!a)throw new Response("This private inquiry link has expired.",{status:410,headers:privateHeaders});
  const form=await request.formData();
  if(a.purpose==="stop" && form.get("op")==="stop") {
    await stopInquiryFollowups(a.lead.shop,a.lead.customerEmail);
    return data({stopped:true},{headers:privateHeaders});
  }
  if(a.purpose!=="resume" || form.get("op")!=="continue" || a.lead.status==="declined") throw new Response("Please contact Atelier Elunora about this inquiry.",{status:409,headers:privateHeaders});
  if(!a.lead.bookingId)return redirect(`/book/${a.lead.shop}?inquiry=${encodeURIComponent(a.raw)}`,{headers:privateHeaders});
  const raw=await locked(a.lead.shop,async tx=>{
    const lead=await tx.bookingLead.findUniqueOrThrow({where:{id:a.lead.id}});
    if(lead.status==="declined")throw new Response("This inquiry has been closed.",{status:409});
    const b=await tx.weddingBooking.findFirstOrThrow({where:{id:lead.bookingId!,shop:lead.shop,customerEmail:lead.customerEmail}}),d=details(b),raw=token();
    d.emailPortalLinks=addEmailPortalLink(d.emailPortalLinks,hash(raw));
    await tx.weddingBooking.update({where:{id:b.id},data:{detailsJson:JSON.stringify(d)}});
    return raw;
  });
  return redirect(`/portal/${a.lead.bookingId}?token=${raw}`,{headers:privateHeaders});
}
export default function Inquiry() {
  const c=useLoaderData<typeof loader>(),result=useActionData<typeof action>();
  const stopped=result?.stopped || c.closed;
  return <main className="experience-page" style={{maxWidth:660,margin:"40px auto",padding:28}}>
    <img src="/elunora-logo.png" alt="Atelier Elunora" style={{width:155,marginBottom:28}}/>
    <p className="eyebrow">YOUR WEDDING INQUIRY</p>
    <h1>{c.expired?"Let’s reconnect.":stopped?"Follow-ups stopped.":c.stop?"Make room for what matters.":"Welcome back."}</h1>
    {c.expired?<p>This private inquiry link has expired. Contact us and we’ll help you continue planning.</p>:stopped?<p>We won’t send further automatic follow-ups about this inquiry. This does not cancel a booking or change required booking notifications.</p>:c.stop?<><p>Would you like to stop automatic follow-ups about your wedding inquiry?</p><Form method="post"><button className="book-now" name="op" value="stop">Stop these follow-ups</button></Form></>:<><p>Hello {c.name}. Your saved {c.booking?"booking":"inquiry"} is ready to review.</p><p>Your date is confirmed only after payment is verified. Availability is checked again before checkout.</p><Form method="post"><button className="book-now" name="op" value="continue">Continue your booking</button></Form></>}
    <p style={{marginTop:28}}>Questions? <a href="mailto:support@atelierelunora.com">Contact Atelier Elunora</a></p>
    <a href="https://www.atelierelunora.com">Return to Atelier Elunora</a>
  </main>;
}
