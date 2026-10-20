import type {ActionFunctionArgs,LoaderFunctionArgs} from "react-router";
import {Form,Link,useActionData,useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import db from "../db.server";
import {calendarStatus,prepareGoogleConnect,disconnectGoogle,retryGoogle} from "../google-calendar.server";
import {hash,locked,token} from "../booking.server";
export async function loader({request}:LoaderFunctionArgs){
  const {session}=await authenticate.admin(request);
  const settings=await db.bookingSettings.findUniqueOrThrow({where:{shop:session.shop}});
  const feed=JSON.parse(settings.configJson).calendarFeed;
  return {enabled:!!feed?.hash,expiresAt:feed?.expiresAt || null,direct:await calendarStatus(session.shop)};
}
export async function action({request}:ActionFunctionArgs){
  const {session}=await authenticate.admin(request), form=await request.formData();
  try {
  if(form.get("op")==="google_connect")return {connectUrl:await prepareGoogleConnect(session.shop)};
  if(form.get("op")==="google_disconnect"){await disconnectGoogle(session.shop);return {success:"Direct sync disconnected. Existing Google events are kept."};}
  if(form.get("op")==="google_retry"){await retryGoogle(session.shop);return {success:"Calendar sync checked. Review the connection status below."};}
  }catch(e){return {error:e instanceof Error?e.message:"Calendar connection needs review."};}
  const raw=token();
  const enabled=form.get("op")==="enable";
  if(!enabled && form.get("op")!=="revoke")return {error:"Unknown action."};
  await locked(session.shop,async tx=>{
    const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop:session.shop}}),c=JSON.parse(settings.configJson);
    c.calendarFeed=enabled?{hash:hash(raw),expiresAt:new Date(Date.now()+365*86400000).toISOString()}:null;
    await tx.bookingSettings.update({where:{shop:session.shop},data:{configJson:JSON.stringify(c)}});
  });
  return enabled?{url:process.env.SHOPIFY_APP_URL+"/calendar-feed/"+session.shop+"?token="+raw}:{success:"Calendar subscription revoked. Remove the calendar from Google if you no longer want its saved events."};
}
export default function CalendarSettings(){
  const settings=useLoaderData<typeof loader>(),result=useActionData<typeof action>();
  return <main style={{padding:32,color:"#4A4B36",background:"#F4F2EF"}}><Link to="/app">Back to bookings</Link><h1>Google Calendar connection</h1><section style={{background:"#fff",padding:24,borderRadius:16,margin:"24px 0"}}><h2>Direct booking sync</h2><p>Confirmed weddings, approved date changes, and cancellations update a dedicated Google calendar automatically. Google edits do not change your bookings.</p><p><strong>{settings.direct.connected?"Connected":settings.direct.ready?"Ready to connect":"Google Cloud setup required"}</strong>{settings.direct.connectedAt && <> · connected {new Date(settings.direct.connectedAt).toLocaleDateString()}</>}</p>{settings.direct.error && <p role="alert">{settings.direct.error}</p>}<Form method="post"><button name="op" value="google_connect" disabled={!settings.direct.ready}>Connect Google Calendar</button>{settings.direct.connected && <><button name="op" value="google_retry">Retry sync now</button><button name="op" value="google_disconnect">Disconnect direct sync</button></>}</Form><p>Access is limited to calendars created by this app. Your personal calendars are not requested.</p>{result && "connectUrl" in result && <a href={result.connectUrl} target="_blank" rel="noreferrer">Continue to Google sign-in</a>}<p>{settings.direct.entries.filter(e=>e.status==="synced").length} bookings synced · {settings.direct.entries.filter(e=>e.status==="failed").length} need attention.</p><p>After verifying direct sync, uncheck the old subscribed calendar in Google to avoid duplicate entries.</p></section><details><summary>Existing calendar subscription</summary><p>Subscribe Google Calendar to your confirmed wedding bookings. Approved date changes and cancellations appear when Google refreshes the subscription. Google controls refresh timing, so updates may take several hours.</p><p>This is a one-way calendar subscription. Editing Google events does not change bookings or block dates in the app.</p><p>Current subscription: {settings.enabled?`enabled until ${settings.expiresAt}`:"not enabled"}.</p><Form method="post"><button name="op" value="enable">Create or replace private calendar subscription</button><button name="op" value="revoke">Revoke subscription</button></Form><p>This link grants read access to customer names, event dates and venue addresses. Keep it private. Replacing it revokes the previous link.</p>{result && !("connectUrl" in result) && ("url" in result?<section><h2>Your private subscription URL</h2><textarea readOnly rows={4} aria-label="Private calendar subscription URL" value={result.url}/><ol><li>Open Google Calendar on your computer.</li><li>Beside Other calendars, select +, then From URL.</li><li>Paste this URL and add the calendar. Keep it private.</li></ol></section>:<p role="status">{"error" in result?result.error:result.success}</p>)}</details></main>;
}
