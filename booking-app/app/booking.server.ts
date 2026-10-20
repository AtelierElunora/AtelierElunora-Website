import { validPortalLink } from "./portal-links";
import { randomBytes, createHash } from "node:crypto";
import db from "./db.server";
import { liveBookingShop } from "./live-store";
import {
  allocate,
  amount,
  date,
  dueDate,
  parseConfig,
  percentAmount,
  quote,
} from "./booking-rules";
import type { Prisma } from "@prisma/client";
export const details = (b: { detailsJson: string }) =>
  JSON.parse(b.detailsJson);
export async function locked<T>(
  shop: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.bookingSettings.upsert({
        where: { shop },
        create: { shop },
        update: {},
      });
      await tx.bookingSettings.update({
        where: { shop },
        data: { updatedAt: new Date() },
      });
      return fn(tx);
    },
    { timeout: 10000 },
  );
}
export function token() {
  return randomBytes(32).toString("hex");
}
export const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export async function portalBooking(id: string, t: string) {
  if (!/^[a-f0-9]{64}$/.test(t))
    throw new Response("Link unavailable", { status: 404 });
  const b = await db.weddingBooking.findUnique({ where: { id } });
  const d = b && details(b);
  if (!d || !validPortalLink(d, hash(t)))
    throw new Response("Link unavailable", { status: 404 });
  return b!;
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (
    !origin ||
    origin !== new URL(process.env.SHOPIFY_APP_URL || request.url).origin
  )
    throw new Response("Invalid request origin", { status: 403 });
}
export async function createBooking(
  shop: string,
  input: {
    name: string;
    email: string;
    venue: string;
    weddingDate: string;
    packageId?: string;
    guests: number;
    addons: Record<string, number>;
    totalCents?: number;
    accepted: boolean;
    source: string;
    phone?: string;
    preferredStartTime?: string;
    customerNotes?: string;
    paymentChoice?: string;
    waitlist?: boolean;
    quoteRequest?: boolean;
  },
) {
  if (
    !input.name.trim() ||
    input.name.length > 200 ||
    !/^\S+@\S+\.\S+$/.test(input.email) ||
    input.email.length > 254 ||
    input.venue.length > 500 ||
    !Number.isSafeInteger(input.guests) || input.guests < 1 || input.guests > 5000
  )
    throw Error("Enter customer name, email and venue.");
  if ((input.phone || "").length > 40 || (input.preferredStartTime || "").length > 100 || (input.customerNotes || "").length > 4000) throw Error("Booking details are too long.");
  const wedding = date(input.weddingDate);
  if (wedding < new Date().toISOString().slice(0, 10))
    throw Error("Choose a future wedding date.");
  const rawToken = token();
  return locked(shop, async (tx) => {
    const s = await tx.bookingSettings.findUniqueOrThrow({ where: { shop } }),
      c = parseConfig(s.configJson);
    const q =
      input.totalCents !== undefined
        ? { totalCents: input.totalCents, package: null, addons: [] }
        : quote(c, input.packageId || "", input.guests, input.addons);
    if (
      !Number.isInteger(q.totalCents) ||
      q.totalCents < 1 ||
      q.totalCents > 2147483647
    )
      throw Error("Enter a positive booking total.");
    if (
      input.source === "customer" && !input.waitlist && !input.quoteRequest &&
      (!s.agreementText.trim() || !input.accepted)
    )
      throw Error("Accept the booking agreement to continue.");
    const bookings = await tx.weddingBooking.findMany({
      where: { shop, weddingDate: wedding },
    });
    const needsQuote = !input.waitlist && (input.quoteRequest || (input.source === "customer" && (c.travelApprovalRequired || (shop===liveBookingShop && (q.package?.maxGuests || 0)>200))));
    const resources = input.waitlist || needsQuote ? [] : allocate(c, s.dailyCapacity, bookings, wedding);
    const holdExpiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    const b = await tx.weddingBooking.create({
      data: {
        shop,
        weddingDate: wedding,
        customerName: input.name.trim(),
        customerEmail: input.email.toLowerCase().trim(),
        venue: input.venue.trim(),
        status: input.waitlist ? "waitlist" : needsQuote ? "quote_review" : "hold",
        totalCents: q.totalCents,
        balanceDueDate: dueDate(wedding, s.balanceDaysBefore),
        detailsJson: JSON.stringify({
          currency: c.currency,
          taxable: c.taxable,
          prepaymentPercent: s.prepaymentPercent,
          balanceDaysBefore: s.balanceDaysBefore,
          agreement: {
            text: s.agreementText,
            version: c.agreementVersion,
            acceptedAt: input.accepted ? new Date().toISOString() : null,
          },
          cancellationRefundPercent: c.cancellationRefundPercent,
          changePolicy: {enabled:c.changesEnabled, cutoffDays:c.changeCutoffDays},
          quoteReview: needsQuote ? {status:"pending",baseCents:q.totalCents,travelCents:0,notes:""} : null,
          phone: input.phone || "",
          preferredStartTime: input.preferredStartTime || "",
          customerNotes: input.customerNotes || "",
          paymentChoice: input.paymentChoice === "full" ? "full" : "prepayment",
          guests: input.guests,
          package: q.package,
          addons: q.addons,
          resources,
          holdExpiresAt,
          portalHash: hash(rawToken),
          portalExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          checklist: {},
          source: input.source,
        }),
      },
    });
    await tx.bookingEvent.create({
      data: {
        shop,
        bookingId: b.id,
        kind: "created",
        text: input.waitlist ? "Waitlist request received; no date hold or payment." : needsQuote ? "Quote review requested; no date held or payment available." : "Booking created; date held for 15 minutes pending payment.",
      },
    });
    return { booking: b, portalToken: rawToken };
  });
}
export async function reservePayment(shop: string, id: string, kind: string) {
  return locked(shop, async (tx) => {
    const b = await tx.weddingBooking.findFirstOrThrow({ where: { id, shop } }),
      d = details(b);
    if (["cancelled", "paid_review", "waitlist", "quote_review", "quote_offered"].includes(b.status))
      throw Error("This booking requires owner review.");
    if (b.status === "hold") {
      const s = await tx.bookingSettings.findUniqueOrThrow({ where: { shop } });
      d.resources = allocate(
        parseConfig(s.configJson),
        s.dailyCapacity,
        await tx.weddingBooking.findMany({
          where: { shop, weddingDate: b.weddingDate },
        }),
        b.weddingDate,
        b.id,
      );
      d.holdExpiresAt = new Date(Date.now() + 15 * 60000).toISOString();
      await tx.weddingBooking.update({
        where: { id },
        data: { detailsJson: JSON.stringify(d) },
      });
    }
    const existing = await tx.bookingPayment.findFirst({
      where: {
        shop,
        bookingId: id,
        status: { in: ["creating", "ready", "review"] },
      },
    });
    if (existing) {
      if (existing.kind !== kind || existing.status !== "ready")
        throw Error("An invoice is already pending or requires review.");
      return existing;
    }
    const remaining = Math.max(0, b.totalCents - b.paidCents);
    const amountCents =
      kind === "prepayment"
        ? b.paidCents
          ? 0
          : percentAmount(b.totalCents, d.prepaymentPercent)
        : ["full", "balance"].includes(kind)
          ? remaining
          : 0;
    if (!amountCents) throw Error("No payment is due for this option.");
    return tx.bookingPayment.create({
      data: {
        shop,
        bookingId: id,
        kind,
        currency: d.currency,
        amountCents,
        expectedGrandTotalCents: amountCents,
      },
    });
  });
}
export async function updateBooking(
  shop: string,
  id: string,
  op: string,
  form: FormData,
) {
  return locked(shop, async (tx) => {
    const b = await tx.weddingBooking.findFirstOrThrow({ where: { id, shop } }),
      d = details(b);
    let data: Prisma.WeddingBookingUpdateInput = {};
    let text = "";
    if (op === "offer_quote") {
      if (!["quote_review", "quote_offered"].includes(b.status) || b.paidCents) throw Error("Only unpaid quote requests can be priced.");
      if (await tx.bookingPayment.count({where:{bookingId:id,shop,status:{in:["creating","ready","review"]}}})) throw Error("Void pending invoices before changing a quote.");
      const baseCents=amount(form.get("base")), travelCents=amount(form.get("travel")), total=baseCents+travelCents;
      if (total<1 || total>2147483647) throw Error("Enter a valid quote total.");
      const notes=String(form.get("quoteNotes") || "").trim();
      if (!notes || notes.length>4000) throw Error("Explain the quote and travel approval, up to 4,000 characters.");
      d.quoteReview={status:"offered",baseCents,travelCents,notes,offeredAt:new Date().toISOString(),revision:(d.quoteReview?.revision || 0)+1};
      d.agreement={...d.agreement,acceptedAt:null};
      data={status:"quote_offered",totalCents:total};
      text="Owner offered a quote including travel; customer acceptance and availability check required. No date held.";
    } else if (op === "offer_date") {
      const change=d.changeRequest;
      if (b.status!=="confirmed" || change?.kind!=="reschedule" || !["pending","offered"].includes(change.status) || change.id!==String(form.get("requestId"))) throw Error("This reschedule request changed. Refresh the booking.");
      const offeredDate=date(form.get("offeredDate"));
      if(offeredDate<=new Date().toISOString().slice(0,10) || offeredDate===b.weddingDate) throw Error("Choose a different future date.");
      const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop}});
      allocate(parseConfig(settings.configJson),settings.dailyCapacity,await tx.weddingBooking.findMany({where:{shop,weddingDate:offeredDate}}),offeredDate,id);
      d.changeRequest={...change,id:token().slice(0,32),status:"offered",offeredDate,offeredAt:new Date().toISOString()};
      text=`Owner offered ${offeredDate}. Original date remains reserved until customer acceptance; offered date is not reserved.`;
    } else if (op === "approve_change" || op === "decline_change" || op === "accept_date") {
      const change=d.changeRequest;
      if (!change || change.status!==(op==="accept_date"?"offered":"pending") || change.id!==String(form.get("requestId"))) throw Error("This change request is no longer pending. Refresh the booking.");
      if (op==="approve_change" || op==="accept_date") {
        if (b.status!=="confirmed") throw Error("Only confirmed bookings can be changed.");
        if (change.kind==="reschedule") {
          const wedding=date(op==="accept_date"?change.offeredDate:change.date);
          if (wedding<=new Date().toISOString().slice(0,10)) throw Error("Choose a future date.");
          const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop}});
          d.resources=allocate(parseConfig(settings.configJson),settings.dailyCapacity,await tx.weddingBooking.findMany({where:{shop,weddingDate:wedding}}),wedding,id);
          data={weddingDate:wedding,balanceDueDate:dueDate(wedding,d.balanceDaysBefore)};
        } else {
          if(await tx.bookingPayment.count({where:{shop,bookingId:id,status:{in:["creating","ready","review"]}}})) throw Error("Void outstanding invoices before approving cancellation.");
          data={status:"cancelled"};
          d.refundProposalCents=percentAmount(b.paidCents,d.cancellationRefundPercent);
        }
      }
      d.changeRequest={...change,status:op==="decline_change"?"declined":"approved",reviewedAt:new Date().toISOString()};
      text=op!=="decline_change" ? `Owner approved customer ${change.kind} request. No refund has been transferred.` : `Owner declined customer ${change.kind} request; existing booking retained.`;
    } else if (op === "invite") {
      if (b.status !== "waitlist") throw Error("Only a waitlist request can be invited.");
      if (b.weddingDate < new Date().toISOString().slice(0, 10)) throw Error("Choose a future date before inviting.");
      const s = await tx.bookingSettings.findUniqueOrThrow({where:{shop}});
      d.resources = allocate(parseConfig(s.configJson),s.dailyCapacity,await tx.weddingBooking.findMany({where:{shop,weddingDate:b.weddingDate}}),b.weddingDate,b.id);
      d.holdExpiresAt = new Date(Date.now()+15*60000).toISOString();
      data.status = "hold";
      text = "Owner invited waitlist customer; date held for 15 minutes. No email sent.";
    } else if (op === "reschedule") {
      const wedding = date(form.get("date"));
      if (
        wedding < new Date().toISOString().slice(0, 10) ||
        ["cancelled", "quote_review", "quote_offered", "waitlist"].includes(b.status)
      )
        throw Error("Cannot reschedule to this date.");
      const s = await tx.bookingSettings.findUniqueOrThrow({ where: { shop } });
      d.resources = allocate(
        parseConfig(s.configJson),
        s.dailyCapacity,
        await tx.weddingBooking.findMany({
          where: { shop, weddingDate: wedding },
        }),
        wedding,
        id,
      );
      data = {
        weddingDate: wedding,
        balanceDueDate: dueDate(wedding, d.balanceDaysBefore),
      };
      if (
        b.status === "paid_review" &&
        b.paidCents > 0 &&
        b.paidCents <= b.totalCents
      )
        data.status = "confirmed";
      text =
        "Wedding rescheduled from " + b.weddingDate + " to " + wedding + ".";
    } else if (op === "cancel") {
      data = { status: "cancelled" };
      d.refundProposalCents = percentAmount(
        b.paidCents,
        d.cancellationRefundPercent,
      );
      text =
        "Booking cancelled. Refund proposal " +
        d.refundProposalCents +
        " cents; no funds have been transferred.";
    } else if (op === "details") {
      for (const k of [
        "venueContact",
        "setupTime",
        "artworkNotes",
        "accessNotes",
        "finalGuests",
      ]) {
        const value = String(form.get(k) || "");
        if (value.length > 4000) throw Error("Wedding details are too long.");
        if (k === "finalGuests" && value.trim()) {
          const count = Number(value);
          if (!Number.isSafeInteger(count) || count < 1 || count > (d.package?.maxGuests || 5000))
            throw Error("Final guest count exceeds your package limit. Contact Atelier Elunora for an updated quote.");
        }
        d[k] = value;
      }
      const venue=String(form.get("venue") || b.venue).slice(0,500);
      if(d.quoteReview?.status==="accepted" && venue!==b.venue) throw Error("Contact Atelier Elunora to review travel before changing an approved venue.");
      data.venue=venue;
      text = "Wedding details updated.";
    } else if (op === "checklist") {
      const key = String(form.get("key"));
      if (!["venue", "artwork", "guests", "equipment"].includes(key))
        throw Error("Invalid checklist item.");
      d.checklist = { ...d.checklist, [key]: form.get("done") === "yes" };
      text = "Checklist updated: " + key;
    } else if (op === "note") {
      text = String(form.get("text") || "").trim();
      if (!text || text.length > 4000)
        throw Error("Enter a note of up to 4,000 characters.");
    } else throw Error("Unknown action.");
    await tx.weddingBooking.update({
      where: { id },
      data: { ...data, detailsJson: JSON.stringify(d) },
    });
    await tx.bookingEvent.create({
      data: { shop, bookingId: id, kind: op, text },
    });
  });
}

export async function requestBookingChange(shop: string, id: string, form: FormData) {
  return locked(shop, async tx => {
    const b=await tx.weddingBooking.findFirstOrThrow({where:{shop,id}}), d=details(b);
    const policy=d.changePolicy || {enabled:false,cutoffDays:30};
    const today=new Date().toISOString().slice(0,10);
    if(b.status!=="confirmed" || !policy.enabled || today>dueDate(b.weddingDate,policy.cutoffDays)) throw Error("Online changes are unavailable under your saved policy. Contact Atelier Elunora.");
    if(["pending","offered"].includes(d.changeRequest?.status)) throw Error("A change request is already awaiting review.");
    const kind=String(form.get("changeKind")), reason=String(form.get("reason") || "").trim();
    if(!["reschedule","cancel"].includes(kind) || !reason || reason.length>4000) throw Error("Choose a change type and enter a reason of up to 4,000 characters.");
    let wedding="";
    if(kind==="reschedule") {
      wedding=date(form.get("date"));
      if(wedding<=today || wedding===b.weddingDate) throw Error("Choose a different future date.");
      const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop}});
      allocate(parseConfig(settings.configJson),settings.dailyCapacity,await tx.weddingBooking.findMany({where:{shop,weddingDate:wedding}}),wedding,id);
    }
    d.changeRequest={id:token().slice(0,32),kind,date:wedding,reason,status:"pending",requestedAt:new Date().toISOString()};
    await tx.weddingBooking.update({where:{id},data:{detailsJson:JSON.stringify(d)}});
    await tx.bookingEvent.create({data:{shop,bookingId:id,kind:"customer_change",text:`Customer requested ${kind}${wedding?" to "+wedding:""}: ${reason}. Existing date remains reserved pending owner review.`}});
  });
}

export async function acceptQuote(shop: string,id: string,form:FormData) {
  return locked(shop,async tx=>{
    const b=await tx.weddingBooking.findFirstOrThrow({where:{shop,id}}), d=details(b);
    if(b.status!=="quote_offered" || d.quoteReview?.status!=="offered" || Number(form.get("revision"))!==d.quoteReview.revision) throw Error("The quote changed or is unavailable. Refresh before accepting.");
    if(form.get("accepted")!=="yes" || !d.agreement?.text?.trim()) throw Error("Accept the saved quote and booking agreement.");
    if(b.weddingDate<=new Date().toISOString().slice(0,10)) throw Error("This date has passed. Ask for an updated quote.");
    const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop}});
    d.resources=allocate(parseConfig(settings.configJson),settings.dailyCapacity,await tx.weddingBooking.findMany({where:{shop,weddingDate:b.weddingDate}}),b.weddingDate,id);
    d.holdExpiresAt=new Date(Date.now()+15*60000).toISOString();
    d.quoteReview={...d.quoteReview,status:"accepted",acceptedAt:new Date().toISOString()};
    d.agreement={...d.agreement,acceptedAt:new Date().toISOString()};
    await tx.weddingBooking.update({where:{id},data:{status:"hold",detailsJson:JSON.stringify(d)}});
    await tx.bookingEvent.create({data:{shop,bookingId:id,kind:"quote",text:"Customer accepted the owner quote and agreement; date held for 15 minutes pending payment."}});
  });
}
