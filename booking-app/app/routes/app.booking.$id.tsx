import {ownerAgreementFields} from "../event-agreement";
import type {BookingContract} from "../booking-contract";
import {ContractCopy,ProviderSigning} from "../BookingContract";
import {currentContract} from "../booking-contract.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {calendarStatus,retryGoogle} from "../google-calendar.server";
import { details, hash, locked, token, updateBooking, countersignBookingContract, requireOrigin } from "../booking.server";
import { CalendarDownload } from "../CalendarDownload";
import {
  graphql,
  invoice,
  refreshBookingPayments,
  recoverInvoice,
} from "../payment.server";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const b = await db.weddingBooking.findFirstOrThrow({
    where: { id: params.id, shop: session.shop },
  });
  const payments = await db.bookingPayment.findMany({
      where: { shop: session.shop, bookingId: b.id },
    }),
    events = await db.bookingEvent.findMany({
      where: { shop: session.shop, bookingId: b.id },
      orderBy: { createdAt: "desc" },
    });
  return { booking: b, payments, events, contract:currentContract(b,details(b)), calendar:await calendarStatus(session.shop,b.id) };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request),
    f = await request.formData(),
    id = params.id!;
  try {
    const op = String(f.get("op"));
    if(op==="contract_details")requireOrigin(request);
    if(op==="countersign_contract"){requireOrigin(request);await countersignBookingContract(session.shop,id,f);return {success:"Provider signature saved. Share the private booking page so the customer can continue to payment."};}
    if (op === "calendar_retry") {await retryGoogle(session.shop,id);return {success:"Google Calendar sync checked."};}
    if (op === "portal") {
      const raw = token();
      await locked(session.shop, async (tx) => {
        const b = await tx.weddingBooking.findFirstOrThrow({
          where: { id, shop: session.shop },
        });
        await tx.weddingBooking.update({
          where: { id },
          data: {
            detailsJson: JSON.stringify({
              ...details(b),
              emailPortalLinks: [],
              portalHash: hash(raw),
              portalExpiresAt: new Date(
                Date.now() + 30 * 86400000,
              ).toISOString(),
            }),
          },
        });
      });
      return {
        success: "New private link created. The previous link is revoked.",
        url: process.env.SHOPIFY_APP_URL + "/portal/" + id + "?token=" + raw,
      };
    }
    if (op === "invoice")
      return {
        success: "Invoice ready.",
        url: await invoice(admin, session.shop, id, String(f.get("kind"))),
      };
    if (op === "refresh") {
      return { success: await refreshBookingPayments(admin,session.shop,id) };
    }
    if (op === "recover") {
      await recoverInvoice(admin, session.shop, id, String(f.get("paymentId")));
      return { success: "Invoice recovered and verified." };
    }
    if (op === "void") {
      const p = await db.bookingPayment.findFirstOrThrow({
        where: {
          id: String(f.get("paymentId")),
          bookingId: id,
          shop: session.shop,
        },
      });
      if (!p.draftOrderId || p.orderId || p.receivedCents)
        throw Error(
          "Paid orders cannot be voided. Use Shopify to issue a refund.",
        );
      const result = await graphql(
        admin,
        `
          mutation ElunoraVoidInvoice($input: DraftOrderDeleteInput!) {
            draftOrderDelete(input: $input) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `,
        { input: { id: p.draftOrderId } },
      );
      if (result.draftOrderDelete.userErrors.length)
        throw Error(
          "Could not void invoice. Refresh the payment status first.",
        );
      await db.bookingPayment.update({
        where: { id: p.id },
        data: { status: "void", invoiceUrl: null },
      });
      return {
        success: "Unpaid invoice voided. You can create a new payment option.",
      };
    }
    await updateBooking(session.shop, id, op, f);
    return { success: "Booking updated." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update booking.",
    };
  }
}
export default function BookingEditor() {
  const loaded = useLoaderData<typeof loader>() as {
      booking: Awaited<ReturnType<typeof db.weddingBooking.findFirstOrThrow>>;
      payments: Awaited<ReturnType<typeof db.bookingPayment.findMany>>;
      events: Awaited<ReturnType<typeof db.bookingEvent.findMany>>;
      calendar: Awaited<ReturnType<typeof calendarStatus>>;
      contract: BookingContract|null;
    },
    { booking: b, payments, events } = loaded,
    d = JSON.parse(b.detailsJson),
    r = useActionData<typeof action>();
  const money = (n: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: d.currency,
    }).format(n / 100);
  return (
    <main
      style={{
        padding: 32,
        background: "#F4F2EF",
        color: "#4A4B36",
        fontFamily: "Arial",
      }}
    >
      <link rel="stylesheet" href="/contract.css"/>
      <Link to="/app">Back to bookings</Link>
      <h1 style={{ fontFamily: "Georgia" }}>
        {b.customerName} · {b.weddingDate}
      </h1>
      <p>
        {b.customerEmail} · {b.status}
      </p>
      <p>
        Total {money(b.totalCents)} · Applied to booking {money(b.paidCents)} ·
        Remaining {money(Math.max(0, b.totalCents - b.paidCents))} · Due{" "}
        {b.balanceDueDate}
      </p>
      {r && (
        <p role="status">
          {"error" in r ? (
            r.error
          ) : (
            <>
              {r.success}
              {"url" in r && (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {" "}
                  Open secure link
                </a>
              )}
            </>
          )}
        </p>
      )}
      <Form method="post">
        {b.status === "waitlist" && <button name="op" value="invite">Invite waitlist customer · hold date 15 minutes</button>} <button name="op" value="portal">
          Generate private customer portal link
        </button>{" "}
        <button name="op" value="refresh">
          Refresh verified payments
        </button>
      </Form>
      <Form method="post">
        <input type="hidden" name="op" value="invoice" />
        <button name="kind" value="prepayment">
          Create prepayment invoice
        </button>{" "}
        <button name="kind" value="full">
          Create full invoice
        </button>{" "}
        <button name="kind" value="balance">
          Collect remaining balance
        </button>
      </Form>
      {["quote_review","quote_offered"].includes(b.status) && <section><h2>Quote & travel approval</h2><p>The customer cannot pay until they accept your quote. No date is held during review.</p><Form method="post"><label>Experience amount <input name="base" inputMode="decimal" required defaultValue={((d.quoteReview?.baseCents || b.totalCents)/100).toFixed(2)}/></label><label>Travel amount <input name="travel" inputMode="decimal" required defaultValue={((d.quoteReview?.travelCents || 0)/100).toFixed(2)}/></label><label>Quote details and travel approval<textarea name="quoteNotes" maxLength={4000} required defaultValue={d.quoteReview?.notes || ""}/></label><button name="op" value="offer_quote">Save quote for customer acceptance</button></Form><p>Generate a private portal link above to share the quote. Email delivery depends on sender setup.</p></section>}
      {["pending","offered"].includes(d.changeRequest?.status) && <section style={{background:"#f3f2e9",padding:24,borderRadius:12,margin:"24px 0"}}><h2>{d.changeRequest.kind==="reschedule"?"Reschedule request":"Cancellation request"}</h2><p>Current date: <strong>{b.weddingDate}</strong>{d.changeRequest.kind==="reschedule" && <> · Requested date: <strong>{d.changeRequest.date}</strong></>}</p><p>{d.changeRequest.reason}</p>{d.changeRequest.status==="pending"?<Form method="post"><input type="hidden" name="requestId" value={d.changeRequest.id}/><button name="op" value="approve_change">{d.changeRequest.kind==="reschedule"?"Approve requested date":"Approve cancellation"}</button><button name="op" value="decline_change">Decline request</button></Form>:<p>Offered {d.changeRequest.offeredDate} · awaiting customer acceptance.</p>}{d.changeRequest.kind==="reschedule" && <details><summary>Offer a different date</summary><Form method="post"><input type="hidden" name="requestId" value={d.changeRequest.id}/><label>Alternative date<input type="date" name="offeredDate" required/></label><button name="op" value="offer_date">Send date offer</button></Form><p>The original date stays reserved. Availability is checked again when the customer accepts.</p></details>}{d.changeRequest.kind==="cancel" && <p>Refunds are reviewed separately.</p>}</section>}
      <section style={{background:"#fff",padding:20,borderRadius:12,margin:"20px 0"}}><h2>Google Calendar</h2><p>{!loaded.calendar.connected?"Direct sync is not connected.":loaded.calendar.entry?.status==="synced"?"Calendar synced":loaded.calendar.entry?.status==="removed"?"Removed from calendar":loaded.calendar.entry?.status==="failed"?"Sync failed — automatic retry scheduled":b.status==="confirmed"?"Waiting to sync":"Appears in Google after booking confirmation"}</p>{loaded.calendar.entry?.lastSyncedAt && <p>Last synced {new Date(loaded.calendar.entry.lastSyncedAt).toLocaleString()}</p>}{loaded.calendar.entry?.error && <p>{loaded.calendar.entry.error}</p>}{loaded.calendar.connected?<Form method="post"><button name="op" value="calendar_retry">Retry calendar sync</button></Form>:<Link to="/app/calendar">Connect Google Calendar</Link>}</section>
      <section aria-label="Booking contract"><h2>Booking contract</h2><p>{loaded.contract?.signature?"Signed by "+loaded.contract.signature.name+" on "+loaded.contract.signature.signedAt:d.agreement?.acceptedAt && !d.agreement?.signatureRequired?"Earlier agreement acceptance recorded; no electronic signature.":"Awaiting customer signature"}</p>
        <p>The customer can review and sign through their private portal link. Signing never marks a payment as received.</p>
        {!d.agreement?.contract?.signature && b.status!=="cancelled" && <Form method="post"><button name="op" value="prepare_contract">{d.agreement?.signatureRequired?"Refresh unsigned contract":"Prepare contract & require customer signature"}</button></Form>}
        {d.agreement?.previousAcceptance && <p>Earlier checkbox acceptance is preserved from {d.agreement.previousAcceptance.acceptedAt}; no typed signature was recorded then.</p>}

        {loaded.contract && <><ContractCopy contract={loaded.contract}/><ProviderSigning contract={loaded.contract}/></>}
        {loaded.contract?.document.serviceAgreement&&<details className="portal-card"><summary>Edit agreement details</summary><Form method="post" className="contract-sign-form">{ownerAgreementFields.map(([key,label,required])=><label key={key}>{label}<textarea name={"contract_"+key} defaultValue={d.agreement?.fields?.[key]||""} maxLength={1000} required={required}/></label>)}<label className="contract-consent"><input type="checkbox" name="useLatestTemplate" value="yes"/><span>Use the latest business contract settings for this revision.</span></label><button name="op" value="contract_details">Save agreement details</button><p>Changes to signed content retain the original and require both signatures again. Void pending invoices before making such changes.</p></Form></details>}
        {!!d.agreement?.contractHistory?.length && <details className="contract-history"><summary>Earlier signed contracts ({d.agreement.contractHistory.length})</summary>{d.agreement.contractHistory.map((copy:any)=><details key={copy.hash}><summary>Signed revision {copy.revision} · {copy.document.weddingDate}</summary><ContractCopy contract={copy}/></details>)}</details>}
      </section>
      {d.keepsakes?.items?.length>0 && <section style={{background:"#f3f2e9",padding:24,borderRadius:12,margin:"24px 0"}}><h2>Shipped keepsakes</h2>{d.keepsakes.items.map((i:any)=><p key={i.variantId}>{i.name} · {i.variantName} · {money(i.unitCents)}</p>)}<p>Paid in full with the first wedding checkout. Fulfill these product lines in Shopify. Keepsakes, shipping and tax do not reduce the wedding balance.</p></section>}
      <h2>Payment history</h2>
      {payments.map((p) => (
        <div key={p.id}>
          <p>
            {p.kind} · {p.status} · Received {money(p.receivedCents)} · Refunded{" "}
            {money(p.refundedCents)}
            {p.orderId && (
              <>
                {" "}
                ·{" "}
                <a
                  href={"shopify://admin/orders/" + p.orderId.split("/").pop()}
                >
                  Open Shopify order / refund
                </a>
              </>
            )}
          </p>
          {p.status === "review" && (
            <Form method="post">
              <input type="hidden" name="paymentId" value={p.id} />
              <button name="op" value="recover">
                Recover Shopify invoice
              </button>
            </Form>
          )}
          {p.draftOrderId &&
            !p.orderId &&
            ["ready", "review"].includes(p.status) && (
              <Form method="post">
                <input type="hidden" name="paymentId" value={p.id} />
                <button name="op" value="void">
                  Void unpaid invoice
                </button>
              </Form>
            )}
        </div>
      ))}
      <h2>Package & resources</h2>
      <p>
        {d.package?.name || "Custom booking"} ·{" "}
        {d.finalGuests || d.guests || "Guest count pending"} guests
      </p>
      <p>
        Reserved resources:{" "}
        {(d.resources || []).join(", ") || "No resource pools configured"}
      </p>
      {d.addons?.map(
        (a: { id: string; name: string; qty: number; priceCents: number }) => (
          <p key={a.id}>
            {a.name} × {a.qty} · {money(a.qty * a.priceCents)}
          </p>
        ),
      )}
      <h2>Wedding details</h2>
      {d.phone && <p>Customer phone: {d.phone}</p>}
      {d.preferredStartTime && <p>Preferred service start: {d.preferredStartTime}</p>}
      {d.customerNotes && <p style={{whiteSpace:"pre-wrap"}}>Customer booking notes: {d.customerNotes}</p>}
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
        <button>Save details</button>
      </Form>
      <h2>Checklist</h2>
      <p>
        Agreement: {d.agreement?.acceptedAt ? "accepted" : "pending"} · Payment:{" "}
        {b.paidCents >= b.totalCents && b.totalCents > 0 ? "paid in full" : b.paidCents > 0 ? "partially paid" : "unpaid"}
      </p>
      {["venue", "artwork", "guests", "equipment"].map((key) => (
        <Form key={key} method="post">
          <input type="hidden" name="key" value={key} />
          <input
            type="hidden"
            name="done"
            value={d.checklist?.[key] ? "no" : "yes"}
          />
          <button name="op" value="checklist">
            {d.checklist?.[key] ? "✓" : "○"} {key}
          </button>
        </Form>
      ))}
      <details><summary>Manually change the booking date</summary>      <h2>Reschedule</h2>
      <Form method="post">
        <input type="date" name="date" required />
        <button name="op" value="reschedule">
          Check availability and reschedule
        </button>
      </Form>
      <CalendarDownload bookingId={b.id} />
      </details>
      <h2>Cancellation</h2>
      <p>
        Saved policy: {d.cancellationRefundPercent}% of payments received
        proposed for refund. Issue refunds in Shopify; the app verifies the
        result.
      </p>
      <Form method="post">
        <label>
          <input type="checkbox" required /> Confirm cancellation of this
          booking
        </label>
        <button name="op" value="cancel">
          Cancel and release date
        </button>
      </Form>
      <h2>Communication & audit history</h2>
      <Form method="post">
        <textarea name="text" required maxLength={4000} />
        <button name="op" value="note">
          Save internal note
        </button>
      </Form>
      {events.map((e) => (
        <p key={e.id}>
          {new Date(e.createdAt).toLocaleString()} · {e.kind} · {e.text}
        </p>
      ))}
    </main>
  );
}
