import {contractReadyForPayment} from "../booking-contract";
import { useEffect, useRef } from "react";
import {ContractCopy,ContractSigning} from "../BookingContract";
import { WeddingKeepsakes } from "../WeddingKeepsakes";
import {currentContract} from "../booking-contract.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";
import {
  details,
  acceptQuote,
  requestBookingChange,
  locked,
  portalBooking,
  requireOrigin,
  updateBooking,
  signBookingContract,
} from "../booking.server";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { invoice, refreshBookingPayments } from "../payment.server";
import { percentAmount } from "../booking-rules";
export const headers = () => ({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
});
const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
export async function loader({ request, params }: LoaderFunctionArgs) {
  const t = new URL(request.url).searchParams.get("token") || "",
    b = await portalBooking(params.id!, t);
  const d = details(b);
  const safeBooking = {
    ...b,
    detailsJson: JSON.stringify(
      Object.fromEntries(
        [
          "changeRequest",
          "quoteReview",
          "phone",
          "preferredStartTime",
          "customerNotes",
          "paymentChoice",
          "venueContact",
          "setupTime",
          "finalGuests",
          "guests",
          "artworkNotes",
          "accessNotes",
        ].map((k) => [k, d[k] || ""]),
      ),
    ),
  };
  const events = await db.bookingEvent.findMany({
    where: {
      shop: b.shop,
      bookingId: b.id,
      kind: {
        in: ["payment", "details", "customer_message", "reschedule", "cancel", "customer_change", "approve_change", "decline_change", "offer_quote", "quote"],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const payments = await db.bookingPayment.findMany({
    where: { shop: b.shop, bookingId: b.id },
    select: {
      id: true,
      kind: true,
      receivedCents: true,
      refundedCents: true,
      orderUpdatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return data(
    {
      payments,
      booking: safeBooking,
      terms: {
        keepsakes:d.keepsakes || null,
        keepsakeReceipts:d.keepsakeReceipts || {},
        keepsakesDue:d.keepsakes?.items?.length && !Object.values(d.keepsakeReceipts||{}).some((r:any)=>r.captured) ? d.keepsakes.subtotalCents : 0,
        currency: d.currency,
        percent: d.prepaymentPercent,
        agreement: d.agreement,
        contract: currentContract(b,d),
        contractHistory: d.agreement?.contractHistory || [],
        package: d.package,
        addons: d.addons,
        checklist: d.checklist,
        changePolicy:d.changePolicy || {enabled:false,cutoffDays:30},
        quoteReview:d.quoteReview,
      },
      token: t,
      events,
    },
    { headers: privateHeaders },
  );
}
export async function action({ request, params }: ActionFunctionArgs) {
  requireOrigin(request);
  const t = new URL(request.url).searchParams.get("token") || "",
    b = await portalBooking(params.id!, t),
    f = await request.formData();
  try {
    const op = f.get("op");
    if (op === "accept_date") {
      await updateBooking(b.shop,b.id,"accept_date",f);
      return data({success:"Your new date is confirmed."},{headers:privateHeaders});
    }
    if (op === "change") {
      await requestBookingChange(b.shop,b.id,f);
      return data({success:"Request saved. Your current date remains reserved until Atelier Elunora reviews it."},{headers:privateHeaders});
    }
    if (op === "accept_quote") {
      await acceptQuote(b.shop,b.id,f,t,request.headers.get("User-Agent")||"");
      return data({success:"Quote and signature saved. If a provider signature is required, Atelier Elunora must countersign before checkout. Date availability is checked again before payment."},{headers:privateHeaders});
    }
    if (op === "invoice") {
      if (!details(b).agreement?.acceptedAt)
        throw Error("Accept your booking agreement before payment.");
      const { admin } = await unauthenticated.admin(b.shop);
      const url = await invoice(admin, b.shop, b.id, String(f.get("kind")));
      return data({ invoiceUrl: url }, { headers: privateHeaders });
    }
    if (op === "refresh") {
      const { admin } = await unauthenticated.admin(b.shop);
      const message = await refreshBookingPayments(admin,b.shop,b.id);
      return data(
        { success: message },
        { headers: privateHeaders },
      );
    }
    if (op === "details") {
      await updateBooking(b.shop, b.id, "details", f);
      return data(
        { success: "Wedding details saved." },
        { headers: privateHeaders },
      );
    }
    if (op === "agreement") {
      const signed=await signBookingContract(b.shop,b.id,f,t,request.headers.get("User-Agent")||"");
      return data({success:signed.alreadySigned?"Your contract is already signed.":signed.contract.document.serviceAgreement?"Your signature is saved. Atelier Elunora will countersign before payment becomes available.":"Your signed contract is saved. You can now choose your payment option."},{headers:privateHeaders});
    }
    if (op === "message") {
      const text = String(f.get("text") || "").trim();
      if (!text || text.length > 4000)
        throw Error("Enter a message of up to 4,000 characters.");
      await db.bookingEvent.create({
        data: { shop: b.shop, bookingId: b.id, kind: "customer_message", text },
      });
      return data(
        { success: "Message saved for Atelier Elunora." },
        { headers: privateHeaders },
      );
    }
    throw Error("Unknown action.");
  } catch (error) {
    return data(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete this action.",
      },
      { status: 400, headers: privateHeaders },
    );
  }
}
export default function Portal() {
  const portalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.parent === window || new URLSearchParams(window.location.search).get("embed") !== "gallery") return;
    const portal = portalRef.current;
    if (!portal) return;
    portal.dataset.galleryEmbedded = "true";
    let frame = 0, previousHeight = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(portal.getBoundingClientRect().height + portal.offsetTop);
        if (height === previousHeight || height < 1) return;
        previousHeight = height;
        window.parent.postMessage({type: "elunora-booking-height", height}, "https://api-elunora-production-nvo32m3ban2cc.azurewebsites.net");
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(portal);
    window.addEventListener("resize", report);
    report();
    return () => { observer.disconnect(); window.removeEventListener("resize", report); cancelAnimationFrame(frame); };
  }, []);
  const {
      booking: b,
      terms,
      events,
      payments,
    } = useLoaderData<typeof loader>(),
    result = useActionData<typeof action>(), navigation=useNavigation();
  const d = JSON.parse(b.detailsJson);
  const money = (n: number) =>
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: terms.currency,
      }).format(n / 100),
    remaining = Math.max(0, b.totalCents - b.paidCents);
  const awaitingProvider=!!terms.contract?.document.serviceAgreement && !!terms.contract.signature && !contractReadyForPayment(terms.contract);
  return (
    <main className="customer-portal" ref={portalRef}>
      <link rel="stylesheet" href="/portal.css"/><link rel="stylesheet" href="/contract.css"/>
      <img
        src="/elunora-logo.png"
        alt="Atelier Elunora"
        style={{ width: 180, maxWidth: "100%", marginBottom: 16 }}
      />
      <p className="eyebrow">YOUR PRIVATE WEDDING STUDIO</p>
      <h1>Your wedding, beautifully planned.</h1>
      <p>
        {b.customerName} · {b.weddingDate} · {b.venue}
      </p>
      <p>{d.preferredStartTime && `Preferred service start: ${d.preferredStartTime}`}</p>
      <p className="status-badge">{({confirmed:"Booking confirmed",quote_offered:"Your quote is ready",quote_review:"Quote in review",waitlist:"On the waitlist",hold:awaitingProvider?"Awaiting Atelier Elunora signature":terms.contract&&!terms.contract.signature?"Review your agreement":"Awaiting payment",cancelled:"Booking cancelled",paid_review:"Payment in review"} as Record<string,string>)[b.status] || "Booking in progress"}</p>
      {b.status === "waitlist" && <p>Your waitlist request has been saved. Your date is not reserved and payment is unavailable until Atelier Elunora invites you to book.</p>}
      {b.status==="quote_review" && <p>Your quote is being reviewed, including travel and event requirements. Your date is not held and payment is unavailable.</p>}
      {b.status==="quote_offered" && <section className="portal-card"><h2>Your wedding quote</h2><p>Experience {money(terms.quoteReview.baseCents)} · Travel {money(terms.quoteReview.travelCents)} · Total {money(b.totalCents)}</p><p style={{whiteSpace:"pre-wrap"}}>{terms.quoteReview.notes}</p><p>We’ll check availability when you accept. Your date is not yet reserved.</p><p>Review and sign your personalized contract below to accept this quote.</p></section>}
      {result && (
        <p role={"error" in result?"alert":"status"}>
          {"error" in result ? (
            result.error
          ) : "success" in result ? (
            result.success
          ) : (
            <a href={result.invoiceUrl} target="_top" rel="noreferrer">
              Continue to secure Shopify checkout
            </a>
          )}
        </p>
      )}
      {terms.contract && !["waitlist","quote_review"].includes(b.status) && <section id="booking-contract" aria-label="Your booking contract">
        <p className="contract-status">{terms.contract.signature?(awaitingProvider?"Your signature is saved. Atelier Elunora will review and countersign before payment becomes available.":"Your signed contract is saved."):terms.agreement?.acceptedAt && !terms.agreement?.signatureRequired?"Your earlier agreement acceptance is recorded. An electronic signature has not been recorded for this copy.":"Review and sign your contract before payment."}</p>
        <ContractCopy contract={terms.contract}/>
        {!terms.contract.signature && ["hold","confirmed","paid_review","quote_offered"].includes(b.status) &&
          <ContractSigning key={terms.contract.hash} contract={terms.contract} quoteRevision={b.status==="quote_offered"?terms.quoteReview.revision:undefined} busy={navigation.state!=="idle"}/>}
      </section>}
      {terms.contractHistory.length>0 && <details className="portal-card contract-history"><summary>Earlier signed contracts ({terms.contractHistory.length})</summary>{terms.contractHistory.map((copy:any)=><details key={copy.hash}><summary>Signed revision {copy.revision} · {copy.document.weddingDate}</summary><ContractCopy contract={copy}/></details>)}</details>}
      {d.changeRequest?.status==="offered" && <section className="portal-card"><h2>A new date for your celebration</h2><p>We can offer <strong>{d.changeRequest.offeredDate}</strong>. Your current date, {b.weddingDate}, stays reserved until you accept.</p><Form method="post"><input type="hidden" name="requestId" value={d.changeRequest.id}/><button name="op" value="accept_date">Accept offered date</button></Form><p className="muted">Availability is checked when you accept. Contact us if this date doesn’t suit you.</p></section>}
      <section className="portal-card"><h2>At a glance</h2><div className="payment-summary">
        <div><span>Experience total</span><strong>{money(b.totalCents)}</strong></div>
        <div><span>Paid toward booking</span><strong>{money(b.paidCents)}</strong></div>
        <div><span>{["quote_review","quote_offered","waitlist"].includes(b.status)?"Proposed balance":"Remaining balance"}</span><strong>{money(remaining)}</strong></div>
      </div>
      {!["quote_review","quote_offered","waitlist","cancelled"].includes(b.status) && <p className="muted">{b.status==="paid_review"?"Your payment is being reviewed.":remaining===0?"Paid in full — thank you.":b.paidCents>0?`Balance due ${b.balanceDueDate}`:awaitingProvider?"Payment becomes available after Atelier Elunora countersigns.":terms.agreement?.signatureRequired&&!contractReadyForPayment(terms.contract)?"Review and sign your agreement to continue.":"Choose prepayment or pay in full below."}</p>}
      </section>
      {remaining > 0 && (!terms.agreement?.signatureRequired || contractReadyForPayment(terms.contract)) && !["cancelled", "paid_review", "waitlist", "quote_review", "quote_offered"].includes(b.status) && (
        <Form method="post">
          <input type="hidden" name="op" value="invoice" />
          {!b.paidCents && (
            <button name="kind" value="prepayment">
              Pay {terms.percent}% prepayment ·{" "}
              {money(percentAmount(b.totalCents, terms.percent)+terms.keepsakesDue)}
            </button>
          )}{" "}
          <button name="kind" value={b.paidCents ? "balance" : "full"}>
            {b.paidCents ? "Pay remaining balance" : "Pay in full"} ·{" "}
            {money(remaining+terms.keepsakesDue)}
          </button>
        </Form>
      )}
      {terms.keepsakesDue > 0 && <p className="muted">Payment buttons include {money(terms.keepsakesDue)} for your keepsakes, paid in full. Shopify adds shipping and any tax. Your wedding prepayment is {money(percentAmount(b.totalCents,terms.percent))}.</p>}
      <Form method="post">
        <button name="op" value="refresh">
          Refresh Shopify payment status
        </button>
      </Form>
      <p className="muted">Payments update after Shopify confirms receipt. Any additional tax appears at checkout.</p>
      <details className="portal-card"><summary>Your collection & extras</summary>

      <p>
        {terms.package?.name || "Custom booking"} ·{" "}
        {d.finalGuests || d.guests || "Guest count to be confirmed"}
      </p>
      {terms.addons?.map(
        (a: { id: string; name: string; qty: number; priceCents: number }) => (
          <p key={a.id}>
            {a.name} × {a.qty} · {money(a.priceCents * a.qty)}
          </p>
        ),
      )}
      </details>
      {terms.keepsakes && <section className="portal-card"><h2>Your keepsake order</h2>{terms.keepsakes.items.map((i:{variantId:string;name:string;variantName:string;unitCents:number})=><p key={i.variantId}>{i.name} · {i.variantName} · {money(i.unitCents)}</p>)}<p>Keepsake subtotal: {money(terms.keepsakes.subtotalCents)} · Paid in full with your first checkout. Shipping and any tax are shown in Shopify.</p><p>{Object.keys(terms.keepsakeReceipts).length ? "Verified keepsake payment, net of refunds: "+money(Object.values(terms.keepsakeReceipts).reduce((sum:number,r:any)=>sum+r.creditCents,0)) : "Awaiting verified payment."}</p></section>}
      <details className="portal-card"><summary>Payment history</summary>
      {payments.map((p) => (
        <p key={p.id}>
          {p.kind} · Shopify receipt (including any keepsakes, shipping & tax): {money(p.receivedCents)} · Refunded{" "}
          {money(p.refundedCents)}
        </p>
      ))}
      </details>
      {!terms.contract && <details className="portal-card"><summary>Saved booking agreement</summary><p style={{whiteSpace:"pre-wrap"}}>{terms.agreement?.text || "Your contract is being prepared."}</p>{terms.agreement?.acceptedAt && <p>Earlier acceptance recorded {terms.agreement.acceptedAt}. No electronic signature is recorded.</p>}</details>}
      <details className="portal-card"><summary>Your wedding details</summary>
      <Form method="post">
        <input type="hidden" name="op" value="details" />
        {[
          "venue",
          "venueContact",
          "setupTime",
          "finalGuests",
          "artworkNotes",
          "accessNotes",
        ].map((k) => (
          <label key={k} style={{ display: "block", margin: 12 }}>
            {({venue:"Venue",venueContact:"Venue contact",setupTime:"Setup time",finalGuests:"Final guest count",artworkNotes:"Artwork notes",accessNotes:"Venue access notes"} as Record<string,string>)[k]}{" "}
            <input
              name={k}
              defaultValue={k === "venue" ? b.venue : d[k] || ""}
            />
          </label>
        ))}
        <button>Save wedding details</button>
      </Form>
      <a
        href={"/calendar/" + b.id + "?token=" + useLoaderData<typeof loader>().token}
      >
        Download wedding calendar entry
      </a>
      </details><details className="portal-card"><summary>Change your booking</summary>
      <p>Requests require our approval and are available until {terms.changePolicy.cutoffDays} days before your event when enabled. Refunds follow your saved policy.</p>
      {d.changeRequest && <p>Latest request: {d.changeRequest.kind} {d.changeRequest.date} · {d.changeRequest.status}</p>}
      {b.status==="confirmed" && terms.changePolicy.enabled && !["pending","offered"].includes(d.changeRequest?.status) && <Form method="post"><input type="hidden" name="op" value="change"/><label>Request type <select name="changeKind"><option value="reschedule">Reschedule</option><option value="cancel">Cancel booking</option></select></label><label>New date · reschedule only <input type="date" name="date"/></label><label>Reason<textarea name="reason" maxLength={4000} required/></label><button>Send request for owner review</button></Form>}
      </details><details className="portal-card"><summary>Contact Atelier Elunora</summary>
      <Form method="post">
        <input type="hidden" name="op" value="message" />
        <label>Your message<textarea name="text" maxLength={4000} required /></label>
        <button>Save message</button>
      </Form>
      </details><details className="portal-card"><summary>Booking activity</summary>
      {events.map((e) => (
        <p key={e.id}>{e.text}</p>
      ))}
      </details>
      {b.status==="confirmed" && <WeddingKeepsakes shop={b.shop} confirmed/>}
      <footer>Thoughtfully created for your celebration.<br/>Atelier Elunora</footer>
    </main>
  );
}
