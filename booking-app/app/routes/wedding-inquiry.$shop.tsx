import {GoogleAdsAttributionFields} from "../GoogleAdsAttributionFields";
import { randomUUID } from "node:crypto";
import { ReferralSourceField } from "../ReferralSourceField";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useRef } from "react";
import db from "../db.server";
import { requireOrigin } from "../booking.server";
import { saveLead } from "../leads.server";
import { liveBookingShop } from "../live-store";
import { createInquiryReporter } from "../inquiry-analytics";

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const parentOrigins = ["https://www.atelierelunora.com", "https://atelierelunora.com"];
export const headers = () => privateHeaders;
function allowed(shop: string | undefined) {
  if (shop !== liveBookingShop) throw new Response("Not found", { status: 404 });
  return shop;
}
export async function loader({ request, params }: LoaderFunctionArgs) {
  const shop = allowed(params.shop);
  await db.bookingSettings.findUniqueOrThrow({ where: { shop } });
  const parentOrigin = new URL(request.url).searchParams.get("parentOrigin") || "";
  return data({ shop, leadToken: randomUUID(), parentOrigin: parentOrigins.includes(parentOrigin) ? parentOrigin : "" }, { headers: privateHeaders });
}
export async function action({ request, params }: ActionFunctionArgs) {
  requireOrigin(request);
  const shop = allowed(params.shop);
  if (Number(request.headers.get("content-length") || 0) > 16384) throw new Response("Request too large", { status: 413 });
  const form = await request.formData();
  try {
    await db.bookingSettings.findUniqueOrThrow({ where: { shop } });
    if (form.get("intent") !== "wedding-inquiry") throw Error("Please use the inquiry form.");
    const date = String(form.get("date") || "");
    if (date && date < new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })) throw Error("Choose a future wedding date, or leave it blank if undecided.");
    const saved = await saveLead(shop, form);
    if (!saved) throw Error("This inquiry has already moved to a booking. Please contact us for help.");
    return data({ saved: true as const, conversionId: saved.conversionId, error: "" }, { headers: privateHeaders });
  } catch (error) {
    return data({ saved: false as const, conversionId: "", error: error instanceof Error ? error.message : "We could not save your inquiry. Please try again." }, { status: 400, headers: privateHeaders });
  }
}
export default function WeddingInquiry() {
  const c = useLoaderData<typeof loader>(), result = useActionData<typeof action>(), navigation = useNavigation();
  const reporter = useRef(createInquiryReporter()), started = useRef(false), root = useRef<HTMLElement>(null);
  const busy = navigation.state !== "idle";
  const inquiryToken = useRef(c.leadToken);
  useEffect(() => {
    if (c.parentOrigin && result?.saved) reporter.current(result, c.shop, c.parentOrigin, window.parent);
    if (result) root.current?.querySelector<HTMLElement>(result.saved ? '[role="status"]' : '[role="alert"]')?.focus();
  }, [result, c.shop, c.parentOrigin]);
  useEffect(() => {
    if (!c.parentOrigin || !root.current) return;
    const resize = () => window.parent.postMessage({ type: "elunora:inquiry-height", height: Math.ceil(root.current?.scrollHeight || 900) }, c.parentOrigin);
    const observer = new ResizeObserver(resize); observer.observe(root.current); resize();
    return () => observer.disconnect();
  }, [c.parentOrigin]);
  function start() {
    if (started.current || !c.parentOrigin) return;
    started.current = true;
    window.parent.postMessage({ type: "elunora:inquiry-started" }, c.parentOrigin);
  }
  return <main className="wedding-inquiry" ref={root}>
    <style>{`html,body{margin:0;background:#f4f2ef;color:#252b1d}.wedding-inquiry{padding:24px;font-family:Arial,sans-serif;box-sizing:border-box}.wedding-inquiry *{box-sizing:border-box}.wedding-inquiry h2{font-family:Georgia,serif;font-size:28px;margin:0 0 12px;line-height:1.2}.wedding-inquiry p{font-size:15px;line-height:1.6;margin:0 0 18px}.wedding-inquiry form{display:grid;gap:16px}.wedding-inquiry label{display:grid;gap:7px;font-size:14px;line-height:1.5}.wedding-inquiry input,.wedding-inquiry select{width:100%;min-width:0;min-height:46px;padding:10px;border:1px solid #888d6f;border-radius:0;background:white;color:#252b1d;font:16px Arial,sans-serif}.wedding-inquiry .fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wedding-inquiry .consent{display:flex;align-items:flex-start;gap:10px}.wedding-inquiry .consent input{width:20px;min-height:20px;flex:none;margin-top:2px}.wedding-inquiry button{min-height:48px;padding:14px 20px;border:1px solid #252b1d;background:#252b1d;color:white;font-size:16px;cursor:pointer}.wedding-inquiry button:disabled{opacity:.65;cursor:wait}.wedding-inquiry :focus-visible{outline:2px solid #252b1d;outline-offset:3px}.wedding-inquiry .notice{font-weight:bold}.wedding-inquiry [role=alert]{padding:12px;border:1px solid #9e3226;background:#fff0ed;color:#71251b}.wedding-inquiry [role=status]{padding:18px;border:1px solid #888d6f}.wedding-inquiry .trap{position:absolute;inset-inline-start:-10000px;width:1px;height:1px;overflow:hidden}@media(max-width:480px){.wedding-inquiry{padding:18px}.wedding-inquiry .fields{grid-template-columns:1fr}}`}</style>
    {result?.saved ? <section role="status" tabIndex={-1}><h2>Your inquiry is on its way.</h2><p>Thank you! We’ll check your date and reply by email with availability and package details.</p><p>No date has been reserved and no payment is due. If you don’t see our reply, check your spam folder or email support@atelierelunora.com.</p></section> : <>
      <h2>Tell us about your wedding.</h2>
      <p className="notice">No payment or commitment required.</p>
      <p>We’ll reply by email with availability and package details. Still choosing a date or venue? Share what you know.</p>
      {result?.error && <p role="alert" tabIndex={-1}>{result.error}</p>}
      <Form method="post" onChange={start}>
        <GoogleAdsAttributionFields parentOrigin={c.parentOrigin}/>
        <input type="hidden" name="intent" value="wedding-inquiry" />
        <input type="hidden" name="leadToken" value={inquiryToken.current} />
        <div className="trap" aria-hidden="true"><label>Leave this blank<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label></div>
        <label htmlFor="inquiry-name">Your name<input id="inquiry-name" name="name" autoComplete="name" maxLength={200} required /></label>
        <div className="fields">
          <label htmlFor="inquiry-email">Email<input id="inquiry-email" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label htmlFor="inquiry-confirm">Confirm email<input id="inquiry-confirm" name="confirmEmail" type="email" autoComplete="email" maxLength={254} required /></label>
        </div>
        <div className="fields">
          <label htmlFor="inquiry-date">Wedding date (optional)<input id="inquiry-date" name="date" type="date" /></label>
          <label htmlFor="inquiry-guests">Approximate guests (optional)<input id="inquiry-guests" name="guests" type="number" inputMode="numeric" min={1} max={5000} /></label>
        </div>
        <label htmlFor="inquiry-venue">Venue or city (optional)<input id="inquiry-venue" name="venue" maxLength={500} placeholder="Undecided is okay" /></label>
        <ReferralSourceField/>
        <label className="consent"><input type="checkbox" name="followUpConsent" value="yes" required /><span>Save my inquiry and allow Atelier Elunora to email me about this event.</span></label>
        <button disabled={busy}>{busy ? "Sending your inquiry…" : "Check my date"}</button>
      </Form>
    </>}
  </main>;
}
