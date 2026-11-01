import {GoogleAdsAttributionFields} from "../GoogleAdsAttributionFields";
import { ReferralSourceField } from "../ReferralSourceField";
import type { ActionFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useRef } from "react";
import { requireOrigin } from "../booking.server";
import { createInquiryReporter } from "../inquiry-analytics";
import { action as saveWeddingInquiry, loader, headers } from "./wedding-inquiry.$shop";
export { loader, headers };

export async function action(args: ActionFunctionArgs) {
  requireOrigin(args.request);
  if (Number(args.request.headers.get("content-length") || 0) > 16384) throw new Response("Request too large", { status: 413 });
  const form = await args.request.formData();
  form.set("confirmEmail", String(form.get("email") || ""));
  const forwardedHeaders = new Headers(args.request.headers);
  forwardedHeaders.delete("content-type");
  forwardedHeaders.delete("content-length");
  const request = new Request(args.request.url, { method: "POST", headers: forwardedHeaders, body: form });
  return saveWeddingInquiry({ ...args, request });
}
export default function SimpleWeddingInquiry() {
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
    <style>{`html,body{margin:0;background:#f4f2ef;color:#252b1d}.wedding-inquiry{padding:24px;font-family:Arial,sans-serif;box-sizing:border-box}.wedding-inquiry *{box-sizing:border-box}.wedding-inquiry h2{font-family:Georgia,serif;font-size:28px;margin:0 0 12px;line-height:1.2}.wedding-inquiry p{font-size:15px;line-height:1.6;margin:0 0 18px}.wedding-inquiry form{display:grid;gap:16px}.wedding-inquiry label{display:grid;gap:7px;font-size:14px;line-height:1.5}.wedding-inquiry input,.wedding-inquiry select{width:100%;min-width:0;min-height:46px;padding:10px;border:1px solid #888d6f;border-radius:0;background:white;color:#252b1d;font:16px Arial,sans-serif}.wedding-inquiry .optional-details{border:1px solid #c9c8b9;padding:12px 14px}.wedding-inquiry .optional-details summary{cursor:pointer;min-height:28px;line-height:1.6;font-size:14px;font-weight:bold}.wedding-inquiry .optional-details[open] summary{margin-bottom:14px}.wedding-inquiry .optional-fields{display:grid;gap:16px}.wedding-inquiry .fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wedding-inquiry .consent{display:flex;align-items:flex-start;gap:10px}.wedding-inquiry .consent input{width:20px;min-height:20px;flex:none;margin-top:2px}.wedding-inquiry button{min-height:48px;padding:14px 20px;border:1px solid #252b1d;background:#252b1d;color:white;font-size:16px;cursor:pointer}.wedding-inquiry button:disabled{opacity:.65;cursor:wait}.wedding-inquiry :focus-visible{outline:2px solid #252b1d;outline-offset:3px}.wedding-inquiry .notice{font-weight:bold}.wedding-inquiry [role=alert]{padding:12px;border:1px solid #9e3226;background:#fff0ed;color:#71251b}.wedding-inquiry [role=status]{padding:18px;border:1px solid #888d6f}.wedding-inquiry .trap{position:absolute;inset-inline-start:-10000px;width:1px;height:1px;overflow:hidden}@media(max-width:480px){.wedding-inquiry{padding:18px}.wedding-inquiry .optional-details{border:1px solid #c9c8b9;padding:12px 14px}.wedding-inquiry .optional-details summary{cursor:pointer;min-height:28px;line-height:1.6;font-size:14px;font-weight:bold}.wedding-inquiry .optional-details[open] summary{margin-bottom:14px}.wedding-inquiry .optional-fields{display:grid;gap:16px}.wedding-inquiry .fields{grid-template-columns:1fr}}`}</style>
    {result?.saved ? <section role="status" tabIndex={-1}><h2>Your inquiry is on its way.</h2><p>Thank you! We’ll check your date and reply by email with availability and package details.</p><p>No date has been reserved and no payment is due. If you don’t see our reply, check your spam folder or email support@atelierelunora.com.</p></section> : <>
      <h2>Tell us about your wedding.</h2>
      <p>Send a quick inquiry. We’ll reply by email with availability and package details. No payment or commitment required.</p>
      {result?.error && <p role="alert" tabIndex={-1}>{result.error}</p>}
      <Form method="post" onChange={start}>
        <GoogleAdsAttributionFields parentOrigin={c.parentOrigin}/>
        <input type="hidden" name="intent" value="wedding-inquiry" />
        <input type="hidden" name="leadToken" value={inquiryToken.current} />
        <div className="trap" aria-hidden="true"><label>Leave this blank<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label></div>
        <label htmlFor="inquiry-name">Your name<input id="inquiry-name" name="name" autoComplete="name" maxLength={200} required /></label>
        <label htmlFor="inquiry-email">Email<input id="inquiry-email" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label htmlFor="inquiry-date">Wedding date (optional)<input id="inquiry-date" name="date" type="date" /></label>
        <details className="optional-details">
          <summary>Add guest count or venue (optional)</summary>
          <div className="optional-fields">
            <label htmlFor="inquiry-guests">Approximate guests<input id="inquiry-guests" name="guests" type="number" inputMode="numeric" min={1} max={5000} /></label>
            <label htmlFor="inquiry-venue">Venue or city<input id="inquiry-venue" name="venue" maxLength={500} placeholder="Undecided is okay" /></label>
          </div>
        </details>
        <ReferralSourceField/>
        <label className="consent"><input type="checkbox" name="followUpConsent" value="yes" required /><span>Save my inquiry and allow Atelier Elunora to email me about this event.</span></label>
        <button disabled={busy}>{busy ? "Sending your inquiry…" : "Send my wedding inquiry"}</button>
      </Form>
    </>}
  </main>;
}
