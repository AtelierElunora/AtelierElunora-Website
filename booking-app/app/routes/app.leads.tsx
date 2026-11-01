import {googleAdsDashboard,setGoogleAdsQualified} from "../google-ads.server";
import {followupDashboard,setFollowupEnabled} from "../lead-followup.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useSearchParams } from "react-router";
import {ownerNoticeLabel, OWNER_INQUIRY_RECIPIENT} from "../owner-inquiry";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { requireOrigin } from "../booking.server";
import { listLeads, updateLead } from "../leads.server";
import { referralDescription, referralSources, summarizeReferrals } from "../referral-source";
import { leadStatuses } from "../leads";

export const headers=()=>({"Cache-Control":"no-store"});
export async function loader({request}:LoaderFunctionArgs){
  const {session}=await authenticate.admin(request);
  return {leads:await listLeads(session.shop),automation:await followupDashboard(session.shop),googleAds:await googleAdsDashboard(session.shop)};
}
export async function action({request}:ActionFunctionArgs){
  const {session}=await authenticate.admin(request);
  requireOrigin(request);
  try {const f=await request.formData();if(f.get("intent")==="automation"){await setFollowupEnabled(session.shop,f.get("enabled")==="yes");return {success:f.get("enabled")==="yes"?"Automatic inquiry follow-ups enabled.":"Automatic inquiry follow-ups paused.",error:""};}if(f.get("intent")==="google-ads-qualified"){await setGoogleAdsQualified(session.shop,String(f.get("id")||""),f.get("qualified")==="yes");return {success:"Google Ads qualification updated.",error:""};}await updateLead(session.shop,f);return {success:"Inquiry updated.",error:""};}
  catch(error){return {success:"",error:error instanceof Error?error.message:"Could not update inquiry."};}
}
export default function Leads(){
  const {leads,automation,googleAds}=useLoaderData<typeof loader>(),result=useActionData<typeof action>();
  const [search]=useSearchParams(), requestedLead=search.get("lead")||"";
  const [filter,setFilter]=useState(requestedLead?"all":"open"), [source,setSource]=useState("all");
  const sourceSummary=summarizeReferrals(leads);
  useEffect(()=>{if(requestedLead){setFilter("all");setSource("all");document.getElementById("lead-"+requestedLead)?.scrollIntoView({block:"center"});}},[requestedLead,leads]);
  const due=leads.filter(l=>l.followUpDue).length;
  const visible=leads.filter(l=>(source==="all" || (l.referralSource || "")===source) && (filter==="all" || (filter==="due"?l.followUpDue:!l.booked&&l.status!=="declined")));
  return <main style={{maxWidth:1000,margin:"auto",padding:24}}>
    <p><Link to="/app/google-ads">Google Ads conversion connection</Link></p>
    <h1>Wedding inquiries</h1><p>{due} follow-up{due===1?"":"s"} due. Leads do not reserve dates or create contracts.</p>
    <p>This page shows the latest 500 inquiries saved through the website. Facebook and Instagram messages are not imported automatically.</p>
    <section style={{border:"1px solid #ccc",borderRadius:12,padding:20,marginBottom:20}} aria-label="Automatic inquiry follow-up">
      <h2>Automatic inquiry follow-up · {automation.config.enabled?"Enabled":"Paused"}</h2>
      <p>A gentle email after 24 hours, then one final note after three days. Delayed messages stay at least 48 hours apart. Private links expire in 14 days; date availability is checked again before payment.</p>
      <p>Stops after payment, cancellation, owner review, personal contact, closure or opt-out. Repeated inquiries share a sequence. Only saved, consented inquiries are eligible; old inquiries are not sent a backlog of emails.</p>
      <Form method="post"><input type="hidden" name="intent" value="automation"/><input type="hidden" name="enabled" value={automation.config.enabled?"no":"yes"}/><button type="submit">{automation.config.enabled?"Pause automatic follow-ups":"Enable automatic follow-ups"}</button></Form>
      <p>Microsoft submission means the message was accepted for sending; it is not a delivery receipt. Failed or uncertain sends need owner review.</p>
    </section>
    {result?.error && <p role="alert">{result.error}</p>}{result?.success && <p role="status">{result.success}</p>}
    <details style={{marginBlock:20}}><summary style={{cursor:"pointer",paddingBlock:12}}>Where inquiries come from</summary><p>Customer-reported sources across the latest {leads.length} inquiries, including closed leads. Bookings counts confirmed bookings linked to these inquiries. Repeat submissions count as separate inquiries.</p><div style={{overflowX:"auto"}}><table><thead><tr><th scope="col">Source</th><th scope="col">Inquiries</th><th scope="col">Bookings</th></tr></thead><tbody>{sourceSummary.map(r=><tr key={r.source}><th scope="row">{r.label}</th><td>{r.inquiries}</td><td>{r.bookings}</td></tr>)}</tbody></table></div></details>
    <label>Heard about us <select value={source} onChange={e=>setSource(e.target.value)}><option value="all">All sources</option><option value="">Not provided</option>{referralSources.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{" "}
    <label>Show <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="open">Open inquiries</option><option value="due">Follow-up due</option><option value="all">All inquiries</option></select></label>
    {!visible.length && <p>No inquiries in this view.</p>}
    {visible.map(l=><article key={l.id} id={"lead-"+l.id} style={{border:"1px solid #ccc",borderRadius:12,padding:20,marginTop:16}}>
      <h2>{l.customerName}</h2><p><a href={`mailto:${l.customerEmail}`}>{l.customerEmail}</a></p>
      <p>{l.weddingDate || "Date not provided"} · {l.venue || "Venue not provided"} · {l.guests?`${l.guests} guests`:"Guest count not provided"}</p>
      <p>Heard about us: {referralDescription(l)}</p>
      <p>Received {new Date(l.createdAt).toLocaleDateString()} · {l.booked?"Booked":l.followUpDue?"Follow-up due":l.status==="contacted"?"Contacted":l.status==="declined"?"Closed":"New inquiry"}</p>
      {l.ownerNotification&&<p>Support notification to {OWNER_INQUIRY_RECIPIENT}: {ownerNoticeLabel(l.ownerNotification)}</p>}
      <div aria-label="Automatic email history">{automation.jobs.filter(j=>j.bookingId===automation.memberships.find(m=>m.id===l.id)?.anchorId).map(j=><p key={j.id}>Email {j.kind.endsWith("1")?"1":"2"} · {j.status==="pending"?(l.status==="contacted"?"Stopped — customer contacted":l.status==="declined"?"Stopped — inquiry closed":`Scheduled ${new Date(j.sendAt).toLocaleString()}`):j.status==="submitted"?"Submitted to Microsoft":j.status==="review"?"Needs owner review — sending was uncertain":j.status==="suppressed"?"Stopped":j.status}</p>)}</div>
      <p>Google Ads: {googleAds.attributed.includes(l.id)?"Ad click captured with tracking consent":"No eligible ad-click attribution"}</p>
      <Form method="post"><input type="hidden" name="intent" value="google-ads-qualified"/><input type="hidden" name="id" value={l.id}/><label><input type="checkbox" name="qualified" value="yes" defaultChecked={googleAds.qualified.includes(l.id)}/>Qualified wedding lead</label>{" "}<button>Save qualification</button></Form>
      {l.bookingId && <Link to={`/app/booking/${l.bookingId}`}>View booking progress</Link>}
      <Form method="post">
        <input type="hidden" name="id" value={l.id}/>
        <label>Status <select name="status" defaultValue={l.status}>{leadStatuses.map(s=><option key={s} value={s}>{s==="declined"?"Closed / do not follow up":s==="new"?"New":"Contacted"}</option>)}</select></label>{" "}
        <label>Next follow-up <input type="date" name="followUpAt" defaultValue={l.followUpAt?new Date(l.followUpAt).toISOString().slice(0,10):""}/></label>
        <label style={{display:"block",marginTop:12}}>Notes<textarea name="notes" defaultValue={l.notes} maxLength={4000} style={{display:"block",width:"100%"}}/></label>
        <button type="submit">Save follow-up</button>
      </Form>
    </article>)}
  </main>;
}
