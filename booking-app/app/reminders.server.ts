import db from "./db.server";
import { details } from "./booking.server";
import { parseConfig } from "./booking-rules";
export async function reminderDrafts(shop: string) {
  const s = await db.bookingSettings.findUniqueOrThrow({ where: { shop } }),
    c = parseConfig(s.configJson);
  const bookings = await db.weddingBooking.findMany({
    where: { shop, status: "confirmed" },
  });
  return bookings
    .filter((b) => b.totalCents > b.paidCents && b.balanceDueDate)
    .flatMap((b) =>
      c.reminderOffsets.map((offset) => {
        const d = new Date(b.balanceDueDate + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - offset);
        const sendDate = d.toISOString().slice(0, 10),
          remaining = new Intl.NumberFormat("en", {
            style: "currency",
            currency: details(b).currency,
          }).format((b.totalCents - b.paidCents) / 100);
        return {
          id: b.id + ":" + b.balanceDueDate + ":" + offset,
          bookingId: b.id,
          customer: b.customerName,
          email: b.customerEmail,
          sendDate,
          ready: sendDate <= new Date().toISOString().slice(0, 10),
          subject: "Your Atelier Elunora wedding balance",
          text: `Hello ${b.customerName},\n\nYour wedding date is ${b.weddingDate}. Your remaining booking amount is ${remaining}, due ${b.balanceDueDate}. Shopify shows any additional tax at checkout. Please use your private booking link to pay securely through Shopify.\n\nWarmly,\nAtelier Elunora`,
        };
      }),
    );
}
