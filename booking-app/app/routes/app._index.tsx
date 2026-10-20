import BookingSettings from "../BookingSettings";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { amount, parseConfig } from "../booking-rules";
import { createBooking, locked } from "../booking.server";
import { enablePaymentWebhooks } from "../payment.server";
import {
  importBookings,
  importFingerprint,
  parseImport,
} from "../import.server";
import { reminderDrafts } from "../reminders.server";
import { scheduleMail } from "../mail.server";
import {liveBookingShop} from "../live-store";
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const settings = await db.bookingSettings.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop },
      update: {},
    }),
    bookings = await db.weddingBooking.findMany({
      where: { shop: session.shop },
      orderBy: { weddingDate: "asc" },
    });
  await scheduleMail(session.shop);
  const mail = await db.bookingMail.findMany({
    where: { shop: session.shop },
    select: { id: true, kind: true, status: true, sendAt: true },
    orderBy: { sendAt: "desc" },
    take: 30,
  });
  return {
    mail,
    emailEnabled: process.env.BOOKING_EMAIL_ENABLED === "true",
    settings:{...settings,configJson:JSON.stringify(parseConfig(settings.configJson))},
    config: parseConfig(settings.configJson),
    bookings,
    reminders: await reminderDrafts(session.shop),
    shop: session.shop,
    appUrl: process.env.SHOPIFY_APP_URL,
  };
}
const lines = (v: FormDataEntryValue | null) =>
  String(v || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const id = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request),
    form = await request.formData();
  try {
    const op = String(form.get("op") || "settings");
    if (op === "webhooks") {
      await enablePaymentWebhooks(admin);
      return { success: "Shopify payment notifications enabled." };
    }
    if (op === "create") {
      const { booking, portalToken } = await createBooking(session.shop, {
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        venue: String(form.get("venue") || ""),
        weddingDate: String(form.get("date") || ""),
        guests: Number(form.get("guests") || 1),
        addons: {},
        totalCents: amount(form.get("total")),
        accepted: false,
        source: "owner",
      });
      return {
        success: "Booking created with a 15-minute date hold.",
        url:
          process.env.SHOPIFY_APP_URL +
          "/portal/" +
          booking.id +
          "?token=" +
          portalToken,
      };
    }
    if (op === "preview") {
      const text = String(form.get("csv") || "");
      return {
        preview: parseImport(text),
        fingerprint: importFingerprint(text),
        csv: text,
      };
    }
    if (op === "import") {
      if (form.get("confirmed") !== "yes")
        throw Error("Confirm the opening payments are accurate.");
      return {
        success: `Imported ${await importBookings(session.shop, String(form.get("csv")), String(form.get("fingerprint")))} bookings.`,
      };
    }
    const dailyCapacity = Number(form.get("capacity")),
      prepaymentPercent = Number(form.get("percent")),
      balanceDaysBefore = Number(form.get("days"));
    if (
      !Number.isInteger(dailyCapacity) ||
      dailyCapacity < 1 ||
      dailyCapacity > 100 ||
      !Number.isInteger(prepaymentPercent) ||
      prepaymentPercent < 1 ||
      prepaymentPercent > 99 ||
      !Number.isInteger(balanceDaysBefore) ||
      balanceDaysBefore < 0 ||
      balanceDaysBefore > 730
    )
      throw Error(
        "Enter capacity 1–100, prepayment 1–99%, and deadline 0–730 days.",
      );
    await locked(session.shop, async (tx) => {
      const prior = await tx.bookingSettings.findUniqueOrThrow({
          where: { shop: session.shop },
        }),
        c = parseConfig(prior.configJson),
        agreementText = String(form.get("agreement") || "");
      if (agreementText.length > 30000) throw Error("Agreement is too long.");
      const packages = lines(form.get("packages")).map((l) => {
          const [name, price, guests] = l.split("|").map((x) => x.trim());
          return {
            id: id(name),
            name,
            priceCents: amount(price),
            maxGuests: Number(guests),
          };
        }),
        addons = lines(form.get("addons")).map((l) => {
          const [name, price] = l.split("|").map((x) => x.trim());
          return { id: id(name), name, priceCents: amount(price) };
        }),
        resources = lines(form.get("resources")).map((l) => {
          const [name, kind, blocked = ""] = l.split("|").map((x) => x.trim());
          return {
            id: id(name),
            name,
            kind,
            blockedDates: blocked
              ? blocked.split(",").map((x) => x.trim())
              : [],
          };
        });
      const config = parseConfig(
        JSON.stringify({
          ...c,
          currency: String(form.get("currency")),
          taxable: form.get("taxable") === "yes",
          blockedDates: lines(form.get("blocked")),
          packages,
          addons,
          resources,
          reminderOffsets: String(form.get("offsets") || "").trim() ? String(form.get("offsets")).split(",").map(Number) : [],
          cancellationRefundPercent: Number(form.get("refund")),
          changesEnabled:form.get("changesEnabled")==="yes",
          changeCutoffDays:Number(form.get("changeCutoffDays")),
          travelApprovalRequired:form.get("travelApproval")==="yes",
          agreementVersion:
            c.agreementVersion +
            (agreementText !== prior.agreementText ? 1 : 0),
        }),
      );
      await tx.bookingSettings.update({
        where: { shop: session.shop },
        data: {
          dailyCapacity,
          prepaymentPercent,
          balanceDaysBefore,
          agreementText,
          configJson: JSON.stringify({...config,eventAgreement:JSON.parse(prior.configJson).eventAgreement,googleCalendar:JSON.parse(prior.configJson).googleCalendar}),
        },
      });
    });
    return {
      success:
        "Settings saved. Existing bookings retain their agreed payment terms and prices.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to complete this action.",
    };
  }
}
export default function BookingStudio() {
  const {
      settings,
      config,
      bookings,
      reminders,
      shop,
      appUrl,
      mail,
      emailEnabled,
    } = useLoaderData<typeof loader>(),
    result = useActionData<typeof action>(),
    navigation = useNavigation();
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingFilter, setBookingFilter] = useState("all");
  const visibleBookings = bookings.filter(b => {
    const matches = `${b.customerName} ${b.customerEmail} ${b.weddingDate} ${b.venue}`.toLowerCase().includes(bookingSearch.trim().toLowerCase());
    return matches && (bookingFilter === "all" || (bookingFilter === "confirmed" ? b.status === "confirmed" : bookingFilter === "balance" ? b.status === "confirmed" && b.paidCents < b.totalCents : b.status === bookingFilter));
  });
  const bookingMoney = (cents: number) => new Intl.NumberFormat("en-US", {style: "currency", currency: config.currency}).format(cents / 100);
  const statusLabel = (status: string) => ({pending:"Awaiting payment", confirmed:"Confirmed", cancelled:"Cancelled", quote_review:"Quote review", quote_offered:"Quote offered", waitlist:"Waitlist", review:"Needs review"}[status] || status.replaceAll("_", " "));
  return (
    <main
      style={{
        background: "#F4F2EF",
        color: "#4A4B36",
        padding: 32,
        minHeight: "100vh",
        fontFamily: "Arial,sans-serif",
      }}
    >
      <img
        src="/elunora-logo.png"
        alt="Atelier Elunora"
        style={{ width: 180, maxWidth: "100%", marginBottom: 16 }}
      />
      <p style={{ letterSpacing: 3, fontSize: 11 }}>
        ATELIER ELUNORA · BOOKING STUDIO
      </p>
      <h1 style={{ fontFamily: "Georgia,serif", fontWeight: 400 }}>
        Wedding bookings
      </h1>
      <p>
        {shop===liveBookingShop ? "Live booking studio · One place for your dates, payments and customer requests." : "Development store testing."}
      </p>
      {result && (
        <div role="status">
          {"error" in result ? (
            result.error
          ) : "success" in result ? (
            <p>
              {result.success}
              {"url" in result && (
                <a href={result.url} target="_blank" rel="noreferrer">
                  {" "}
                  Open private booking link
                </a>
              )}
            </p>
          ) : null}
        </div>
      )}
      <section aria-labelledby="booking-list-heading" style={{background:"#fffefa", padding:24, border:"1px solid #D6D2BC", borderRadius:6, marginBottom:24}}>
        <h2 id="booking-list-heading">Your bookings <small>({bookings.length})</small></h2>
        <div style={{display:"flex", flexWrap:"wrap", gap:16, alignItems:"end", marginBottom:20}}>
          <label style={{flex:"1 1 240px"}}>Search bookings<input type="search" value={bookingSearch} onChange={e=>setBookingSearch(e.target.value)} placeholder="Name, email, wedding date or venue" style={{display:"block", width:"100%", padding:12, marginTop:6}}/></label>
          <label>Show<select value={bookingFilter} onChange={e=>setBookingFilter(e.target.value)} style={{display:"block", padding:12, marginTop:6}}><option value="all">All bookings</option><option value="confirmed">Confirmed</option><option value="balance">Balance outstanding</option><option value="pending">Awaiting payment</option><option value="quote_review">Quote review</option><option value="quote_offered">Quote offered</option><option value="waitlist">Waitlist</option><option value="cancelled">Cancelled</option></select></label>
        </div>
        <p role="status">{visibleBookings.length} {visibleBookings.length === 1 ? "booking" : "bookings"} shown</p>
        {!bookings.length ? <p>No bookings yet. New bookings will appear here.</p> : !visibleBookings.length ? <p>No bookings match your search or filter.</p> : <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))", gap:16}}>{visibleBookings.map(b=><article key={b.id} style={{border:"1px solid #D6D2BC", borderRadius:6, padding:20, background:"#F4F2EF"}}>
          <p style={{margin:"0 0 8px", fontWeight:700}}><time dateTime={b.weddingDate}>{new Date(b.weddingDate+"T12:00:00Z").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"})}</time></p>
          <h3 style={{margin:"8px 0"}}><Link to={"/app/booking/"+b.id}>{b.customerName}</Link></h3>
          <p style={{overflowWrap:"anywhere"}}>{b.customerEmail}</p>
          {b.venue && <p style={{overflowWrap:"anywhere"}}>{b.venue}</p>}
          <p><strong>{statusLabel(b.status)}</strong></p>
          <p>{b.paidCents >= b.totalCents && b.totalCents > 0 ? "Paid in full" : b.paidCents > 0 ? "Partially paid" : "No payment received"} · {bookingMoney(b.paidCents)} paid<br/><strong>{bookingMoney(Math.max(0,b.totalCents-b.paidCents))} remaining</strong></p>
          <Link to={"/app/booking/"+b.id} style={{display:"inline-block", padding:"12px 16px", background:"#4A4B36", color:"#fff", borderRadius:4}}>View booking & payments</Link>
        </article>)}</div>}
        <p><a href={appUrl+"/book/"+shop} target="_blank" rel="noreferrer">{shop===liveBookingShop?"Open customer booking page":"Open customer booking test"}</a></p>
      </section>
      <BookingSettings key={String(settings.updatedAt)} settings={settings} config={config} busy={navigation.state!=="idle"}/>
      <p><Link to="/app/calendar">Connect Google Calendar</Link></p>
      <section>
        <h3>Create a booking</h3>
        <Form method="post">
          <input type="hidden" name="op" value="create" />
          <div style={{ display: "grid", gap: 12, maxWidth: 600 }}>
            <input name="name" placeholder="Customer name" required />
            <input name="email" type="email" placeholder="Email" required />
            <input name="date" type="date" required />
            <input name="venue" placeholder="Venue" required />
            <input
              name="guests"
              type="number"
              min={1}
              placeholder="Guests"
              required
            />
            <input
              name="total"
              placeholder="Agreed total, e.g. 1000.00"
              required
            />
            <button>Create date hold</button>
          </div>
        </Form>
        <Form method="post">
          <button name="op" value="webhooks">
            Enable Shopify payment notifications
          </button>
        </Form>
      </section>
      <section>
        <h2>Balance reminder drafts</h2>
        <p>
          {emailEnabled ? shop===liveBookingShop ? "Automatic booking emails and balance reminders are enabled for this store." : "Automatic delivery is enabled for the configured test recipients." : "Automatic delivery is pending sender setup."} Paid and cancelled bookings are excluded from balance reminders.
        </p>
        {reminders
          .filter((r) => r.ready)
          .map((r) => (
            <details key={r.id}>
              <summary>
                {r.sendDate} · {r.customer} · {r.email}
              </summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{r.text}</pre>
            </details>
          ))}
      </section>
      <section>
        <h2>Email delivery history</h2>
        {mail.map((m) => (
          <p key={m.id}>
            {m.kind} · {m.status} · {new Date(m.sendAt).toLocaleDateString()}
          </p>
        ))}
      </section>
      <section>
        <h2>Import existing bookings</h2>
        <p>
          CSV headers: external_id,name,email,date,venue,total,paid,balance_due
        </p>
        <Form method="post">
          <textarea name="csv" required rows={6} />
          <button name="op" value="preview">
            Preview import
          </button>
        </Form>
        {result && "preview" in result && result.preview && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Opening payment</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.map((p) => (
                  <tr key={p.externalId}>
                    <td>{p.name}</td>
                    <td>{p.weddingDate}</td>
                    <td>{(p.paidCents / 100).toFixed(2)}</td>
                    <td>{((p.totalCents - p.paidCents) / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Form method="post">
              <input type="hidden" name="csv" value={result.csv} />
              <input
                type="hidden"
                name="fingerprint"
                value={result.fingerprint}
              />
              <label>
                <input type="checkbox" name="confirmed" value="yes" required />{" "}
                Opening payments are accurate; these historical payments are not
                verified by Shopify.
              </label>
              <button name="op" value="import">
                Import previewed bookings
              </button>
            </Form>
          </>
        )}
      </section>
    </main>
  );
}
