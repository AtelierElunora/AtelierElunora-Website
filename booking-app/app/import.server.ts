import { createHash } from "node:crypto";
import { allocate, amount, date, parseConfig } from "./booking-rules";
import { details, locked } from "./booking.server";
function csv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === "") quoted = !quoted;
      else throw Error("Unexpected CSV quote.");
    } else if (!quoted && [",", "\n", "\r"].includes(c)) {
      row.push(field);
      field = "";
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else field += c;
  }
  if (quoted) throw Error("Unclosed CSV quote.");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function parseImport(text: string) {
  if (text.length > 200000) throw Error("Import is limited to 200 KB.");
  const rows = csv(text),
    headers = rows.shift()?.map((h) => h.trim().replace(/^\uFEFF/, "")),
    required = [
      "external_id",
      "name",
      "email",
      "date",
      "venue",
      "total",
      "paid",
      "balance_due",
    ];
  if (
    !headers ||
    required.some((h) => !headers.includes(h)) ||
    new Set(headers).size !== headers.length
  )
    throw Error("Include the CSV template headers.");
  if (rows.length > 500) throw Error("Import at most 500 bookings per batch.");
  const seen = new Set();
  return rows.map((row, i) => {
    const get = (k: string) => row[headers.indexOf(k)]?.trim() || "";
    const externalId = get("external_id"),
      name = get("name"),
      email = get("email");
    if (
      !externalId ||
      seen.has(externalId) ||
      externalId.length > 200 ||
      !name ||
      name.length > 200 ||
      !/^\S+@\S+\.\S+$/.test(email)
    )
      throw Error(`Row ${i + 2}: check unique ID, name and email.`);
    seen.add(externalId);
    const weddingDate = date(get("date")),
      totalCents = amount(get("total")),
      paidCents = amount(get("paid"));
    if (!totalCents || paidCents > totalCents)
      throw Error(`Row ${i + 2}: paid cannot exceed the positive total.`);
    return {
      externalId,
      name,
      email,
      weddingDate,
      venue: get("venue").slice(0, 500),
      totalCents,
      paidCents,
      balanceDueDate: paidCents < totalCents ? date(get("balance_due")) : null,
    };
  });
}
export const importFingerprint = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export async function importBookings(
  shop: string,
  text: string,
  expected: string,
) {
  if (importFingerprint(text) !== expected)
    throw Error("Preview the CSV again before importing.");
  const rows = parseImport(text);
  return locked(shop, async (tx) => {
    const s = await tx.bookingSettings.findUniqueOrThrow({ where: { shop } }),
      c = parseConfig(s.configJson);
    const bookings = await tx.weddingBooking.findMany({ where: { shop } }),
      existing = new Set(
        bookings.map((b) => details(b).externalId).filter(Boolean),
      );
    for (const row of rows) {
      if (existing.has(row.externalId))
        throw Error("Already imported: " + row.externalId);
      const resources = allocate(c, s.dailyCapacity, bookings, row.weddingDate);
      const b = await tx.weddingBooking.create({
        data: {
          shop,
          weddingDate: row.weddingDate,
          customerName: row.name,
          customerEmail: row.email,
          venue: row.venue,
          totalCents: row.totalCents,
          paidCents: row.paidCents,
          balanceDueDate: row.balanceDueDate,
          status: "confirmed",
          detailsJson: JSON.stringify({
            currency: c.currency,
          taxable: c.taxable,
            externalId: row.externalId,
            source: "csv_import",
            openingPaidCents: row.paidCents,
            prepaymentPercent: s.prepaymentPercent,
            balanceDaysBefore: s.balanceDaysBefore,
            cancellationRefundPercent: c.cancellationRefundPercent,
            resources,
            checklist: {},
            agreement: {
              text: s.agreementText,
              version: c.agreementVersion,
              acceptedAt: null,
            },
          }),
        },
      });
      bookings.push(b);
      existing.add(row.externalId);
      await tx.bookingEvent.create({
        data: {
          shop,
          bookingId: b.id,
          kind: "import",
          text: `Imported opening balance: ${row.paidCents} cents. Historical payments are owner supplied, not verified by Shopify.`,
        },
      });
    }
    return rows.length;
  });
}
