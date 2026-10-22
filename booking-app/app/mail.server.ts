import {runLeadFollowups} from "./lead-followup.server";
import {followupKinds} from "./lead-followup";
import { addEmailPortalLink } from "./portal-links";
import {bookingEmail} from "./booking-email";
import { randomUUID } from "node:crypto";
import { emailProvider } from "./email-provider.server";
import db from "./db.server";
import {bookingRecipientAllowed} from "./live-store";
import { details, hash, locked, token } from "./booking.server";
import { reminderDrafts } from "./reminders.server";
import {syncBookingGalleries} from "./gallery.server";
let running = false;
export async function scheduleMail(shop: string) {
  if(shop==="v0j63n-ms.myshopify.com")await syncBookingGalleries();
  for (const b of await db.weddingBooking.findMany({
    where: { shop, status: "confirmed", paidCents: { gt: 0 } },
  })) {
    if (details(b).source === "csv_import") continue;
    const id = b.id + ":confirmation";
    await db.bookingMail.upsert({
      where: { id },
      create: {
        id,
        shop,
        bookingId: b.id,
        kind: "confirmation",
        sendAt: new Date(),
        operationId: randomUUID(),
      },
      update: {},
    });
  }
  for(const b of await db.weddingBooking.findMany({where:{shop}})) {
    const d=details(b),jobs=[];
    if(b.status==="quote_offered" && d.quoteReview?.status==="offered") jobs.push({id:`${b.id}:quote:${d.quoteReview.revision}`,kind:"quote"});
    if(d.changeRequest && ["approved","declined","offered"].includes(d.changeRequest.status)) jobs.push({id:`${b.id}:change:${d.changeRequest.id}${d.changeRequest.status==="offered"?":offered":""}`,kind:"change"});
    for(const job of jobs)await db.bookingMail.upsert({where:{id:job.id},create:{...job,shop,bookingId:b.id,sendAt:new Date(),operationId:randomUUID()},update:{}});
  }
  const drafts = await reminderDrafts(shop),
    latest = new Map<string, string>();
  for (const r of drafts.filter((r) => r.ready))
    if ((latest.get(r.bookingId) || "") < r.sendDate)
      latest.set(r.bookingId, r.sendDate);
  for (const r of drafts.filter(
    (r) => !r.ready || latest.get(r.bookingId) === r.sendDate,
  ))
    await db.bookingMail.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        shop,
        bookingId: r.bookingId,
        kind: "balance",
        dueDate: r.id.split(":")[1],
        sendAt: new Date(r.sendDate + "T09:00:00Z"),
        operationId: randomUUID(),
      },
      update: {},
    });
}
export async function runMail() {
  if (running || process.env.BOOKING_EMAIL_ENABLED !== "true") return;
  running = true;
  try {
    const sender = process.env.BOOKING_EMAIL_SENDER || "",
      allowed = new Set(
        (process.env.BOOKING_EMAIL_TEST_RECIPIENTS || "")
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      );
    if (!/^\S+@\S+\.\S+$/.test(sender))
      throw Error("Email sender is not configured.");
    const provider = emailProvider();
    try {await runLeadFollowups(provider,sender,allowed);}
    catch {console.error("Inquiry follow-up worker needs review");}
    const shops = await db.bookingSettings.findMany();
    for (const { shop } of shops) await scheduleMail(shop);
    const jobs = await db.bookingMail.findMany({
      where: {
        kind: {notIn:followupKinds},
        status: { in: ["pending", "accepted", "sending"] },
        sendAt: { lte: new Date() },
      },
      take: 10,
      orderBy: { sendAt: "asc" },
    });
    for (const job of jobs) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (job.status !== "pending") {
        if (Date.now() - job.updatedAt.getTime() < 60000) continue;
        const saved = JSON.parse(job.payloadJson),
          result = await provider.poll(
            saved.email || saved,
            job.operationId,
            saved.providerId || null,
            saved.attemptAt || job.sendAt.toISOString(),
          );
        await db.bookingMail.update({
          where: { id: job.id },
          data: {
            status: result.status,
            payloadJson: JSON.stringify({
              ...saved,
              providerId: result.providerId,
            }),
          },
        });
        if (["bounced", "complained", "suppressed"].includes(result.status))
          await locked(job.shop, async (tx) => {
            const b = await tx.weddingBooking.findFirst({
              where: { id: job.bookingId, shop: job.shop },
            });
            if (b)
              await tx.weddingBooking.update({
                where: { id: b.id },
                data: {
                  detailsJson: JSON.stringify({
                    ...details(b),
                    emailSuppressed: true,
                  }),
                },
              });
          });
        continue;
      }
      const reminders =
          job.kind === "balance" ? await reminderDrafts(job.shop) : [],
        ready = reminders.filter(
          (r) => r.bookingId === job.bookingId && r.ready,
        ),
        latestDate = ready
          .map((r) => r.sendDate)
          .sort()
          .at(-1);
      const payload = await locked(job.shop, async (tx) => {
        const current = await tx.bookingMail.findUniqueOrThrow({
          where: { id: job.id },
        });
        if (current.status !== "pending") return null;
        const b = await tx.weddingBooking.findFirst({
          where: { id: job.bookingId, shop: job.shop },
        });
        if (
          (job.kind === "balance" &&
            !ready.some((r) => r.id === job.id && r.sendDate === latestDate)) ||
          !b ||
          !(job.kind==="quote" ? b.status==="quote_offered" && job.id===`${b.id}:quote:${details(b).quoteReview?.revision}` : job.kind==="change" ? ["approved","declined","offered"].includes(details(b).changeRequest?.status) && job.id===`${b.id}:change:${details(b).changeRequest?.id}${details(b).changeRequest?.status==="offered"?":offered":""}` : b.status==="confirmed") ||
          (job.kind === "balance" &&
            (b.paidCents >= b.totalCents || job.dueDate !== b.balanceDueDate))
        ) {
          await tx.bookingMail.update({
            where: { id: job.id },
            data: { status: "suppressed" },
          });
          return null;
        }
        if (!bookingRecipientAllowed(job.shop,b.customerEmail,allowed)) return null;
        const d = details(b);
        if (d.emailSuppressed) {
          await tx.bookingMail.update({
            where: { id: job.id },
            data: { status: "suppressed" },
          });
          return null;
        }
        const raw = token();
        d.emailPortalLinks = addEmailPortalLink(d.emailPortalLinks, hash(raw));
        await tx.weddingBooking.update({
          where: { id: b.id },
          data: { detailsJson: JSON.stringify(d) },
        });
        const link = process.env.SHOPIFY_APP_URL + "/portal/" + b.id + "?token=" + raw;
        const content=bookingEmail(job.kind,b,d,link);
        const payload = {
          senderAddress: sender,
          recipients: { to: [{ address: b.customerEmail }] },
          content,
          replyTo: [
            {
              address: "support@atelierelunora.com",
              displayName: "Atelier Elunora",
            },
          ],
          userEngagementTrackingDisabled: true,
        };
        await tx.bookingMail.update({
          where: { id: job.id },
          data: { status: "sending", payloadJson: JSON.stringify({email:payload,attemptAt:new Date().toISOString()}) },
        });
        return payload;
      });
      if (!payload) continue;
      const result = await provider.send(payload, job.operationId);
      const saved = JSON.parse(
        (await db.bookingMail.findUniqueOrThrow({ where: { id: job.id } }))
          .payloadJson,
      );
      await db.bookingMail.update({
        where: { id: job.id },
        data: {
          status: result.status,
          payloadJson: JSON.stringify({
            ...saved,
            providerId: result.providerId,
          }),
        },
      });
    }
  } finally {
    running = false;
  }
}
export function startMailWorker() {
  if (process.env.BOOKING_EMAIL_ENABLED !== "true") return;
  setInterval(() => {
    void runMail().catch(() =>
      console.error("Booking mail worker needs review"),
    );
  }, 60000).unref();
}
