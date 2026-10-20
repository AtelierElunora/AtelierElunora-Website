export type StudioConfig = {
  currency: string;
  taxable: boolean;
  blockedDates: string[];
  packages: {
    id: string;
    name: string;
    priceCents: number;
    maxGuests: number;
  }[];
  addons: { id: string; name: string; priceCents: number }[];
  resources: {
    id: string;
    name: string;
    kind: string;
    blockedDates: string[];
  }[];
  reminderOffsets: number[];
  cancellationRefundPercent: number;
  agreementVersion: number;
  changesEnabled: boolean;
  changeCutoffDays: number;
  travelApprovalRequired: boolean;
};
export const defaultConfig: StudioConfig = {
  currency: "USD",
  taxable: true,
  blockedDates: [],
  packages: [],
  addons: [],
  resources: [],
  reminderOffsets: [14, 7, 1, 0],
  cancellationRefundPercent: 0,
  agreementVersion: 1,
  changesEnabled: true,
  changeCutoffDays: 30,
  travelApprovalRequired: false,
};
export function date(value: unknown): string {
  const s = String(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s
  )
    throw Error("Enter a valid wedding date.");
  return s;
}
export function dueDate(wedding: string, days: number) {
  const d = new Date(date(wedding) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
export function amount(value: unknown) {
  const s = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(s))
    throw Error("Enter an amount with at most two decimal places.");
  const [a, b = ""] = s.split(".");
  const n = BigInt(a) * 100n + BigInt(b.padEnd(2, "0"));
  if (n > 2147483647n) throw Error("Amount is too large.");
  return Number(n);
}
export function percentAmount(total: number, p: number) {
  return Number((BigInt(total) * BigInt(p) + 50n) / 100n);
}
export function parseConfig(raw: string): StudioConfig {
  const parsed=JSON.parse(raw);
  delete parsed.googleCalendar;
  const c: StudioConfig = { ...defaultConfig, ...parsed };
  if (!["USD", "CAD", "GBP", "EUR"].includes(c.currency))
    throw Error("Supported currencies: USD, CAD, GBP, EUR.");
  for (const list of [
    "blockedDates",
    "packages",
    "addons",
    "resources",
    "reminderOffsets",
  ] as const)
    if (!Array.isArray(c[list])) throw Error("Invalid " + list);
  if (typeof c.taxable !== "boolean")
    throw Error("Choose whether Shopify should calculate tax.");
  c.blockedDates.forEach(date);
  if (typeof c.changesEnabled !== "boolean" || typeof c.travelApprovalRequired !== "boolean" || !Number.isInteger(c.changeCutoffDays) || c.changeCutoffDays < 0 || c.changeCutoffDays > 730) throw Error("Choose valid customer change and travel approval policies.");
  if (
    !Number.isInteger(c.cancellationRefundPercent) ||
    c.cancellationRefundPercent < 0 ||
    c.cancellationRefundPercent > 100
  )
    throw Error("Refund percentage must be 0–100.");
  if (!Number.isInteger(c.agreementVersion) || c.agreementVersion < 1)
    throw Error("Agreement version must be positive.");
  for (const p of [...c.packages, ...c.addons])
    if (
      !p.id ||
      !p.name ||
      !Number.isInteger(p.priceCents) ||
      p.priceCents < 0 ||
      p.priceCents > 2147483647
    )
      throw Error(
        "Each package and add-on needs a distinct name and valid price.",
      );
  if (
    new Set(c.packages.map((p) => p.id)).size !== c.packages.length ||
    new Set(c.addons.map((p) => p.id)).size !== c.addons.length ||
    new Set(c.resources.map((p) => p.id)).size !== c.resources.length
  )
    throw Error(
      "Use distinct names within each package, add-on and resource list.",
    );
  for (const p of c.packages)
    if (!Number.isInteger(p.maxGuests) || p.maxGuests < 1)
      throw Error("Packages need a positive maximum guest count.");
  for (const r of c.resources) {
    if (
      !r.id ||
      !["staff", "printer", "station"].includes(r.kind) ||
      !r.name ||
      !Array.isArray(r.blockedDates)
    )
      throw Error(
        "Resources need a name, a staff/printer/station type, and valid blocked dates.",
      );
    r.blockedDates.forEach(date);
  }
  if (
    c.reminderOffsets.some(
      (n: number) => !Number.isInteger(n) || n < 0 || n > 730,
    ) ||
    new Set(c.reminderOffsets).size !== c.reminderOffsets.length
  )
    throw Error("Reminder offsets must be unique numbers from 0–730.");
  return c;
}
export function quote(
  c: StudioConfig,
  packageId: string,
  guests: number,
  addons: Record<string, number>,
) {
  const p = c.packages.find((x) => x.id === packageId);
  if (!p || !Number.isInteger(guests) || guests < 1 || guests > p.maxGuests)
    throw Error("Choose a package that supports your guest count.");
  let total = p.priceCents;
  const selected = [];
  for (const [id, qty] of Object.entries(addons)) {
    const a = c.addons.find((x) => x.id === id);
    if (!a || !Number.isInteger(qty) || qty < 0 || qty > 24)
      throw Error("Invalid add-on quantity.");
    total += a.priceCents * qty;
    if (qty) selected.push({ ...a, qty });
  }
  if (total < 1 || total > 2147483647) throw Error("Invalid package total.");
  return { totalCents: total, package: p, addons: selected };
}
export type CapacityBooking = {
  id: string;
  weddingDate: string;
  status: string;
  detailsJson: string;
};
export function allocate(
  c: StudioConfig,
  capacity: number,
  bookings: CapacityBooking[],
  wedding: string,
  exclude = "",
  now = Date.now(),
) {
  date(wedding);
  if (c.blockedDates.includes(wedding))
    throw Error("This wedding date is blocked.");
  const busy = bookings.filter(
    (b) =>
      b.id !== exclude &&
      b.weddingDate === wedding &&
      !["cancelled", "paid_review", "waitlist", "quote_review", "quote_offered"].includes(b.status) &&
      (b.status !== "hold" ||
        Date.parse(JSON.parse(b.detailsJson).holdExpiresAt) > now),
  );
  if (busy.length >= capacity)
    throw Error("This wedding date is fully booked.");
  const used = new Set(
    busy.flatMap((b) => JSON.parse(b.detailsJson).resources || []),
  );
  const chosen: string[] = [];
  for (const kind of new Set(c.resources.map((r) => r.kind))) {
    const pool = c.resources.filter(
      (r) => r.kind === kind && !r.blockedDates.includes(wedding),
    );
    const unassigned = busy.filter(
      (b) =>
        !(JSON.parse(b.detailsJson).resources || []).some((id: string) =>
          c.resources.some((r) => r.id === id && r.kind === kind),
        ),
    ).length;
    const available = pool.filter((r) => !used.has(r.id));
    const r = available[unassigned];
    if (!r) throw Error("No " + kind + " resource is available on this date.");
    chosen.push(r.id);
  }
  return chosen;
}
export function calendar(
  booking: {
    id: string;
    weddingDate: string;
    customerName: string;
    venue: string;
    status: string;
  },
  now = new Date(),
) {
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\n|\r/g, "\\n")
      .replace(/[,;]/g, "\\$&");
  const start = booking.weddingDate.replaceAll("-", "");
  const end = new Date(booking.weddingDate + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 1);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atelier Elunora//Bookings//EN",
    "BEGIN:VEVENT",
    "UID:" + booking.id + "@atelierelunora.com",
    "DTSTAMP:" +
      now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, ""),
    "DTSTART;VALUE=DATE:" + start,
    "DTEND;VALUE=DATE:" + end.toISOString().slice(0, 10).replaceAll("-", ""),
    "SUMMARY:" + esc("Atelier Elunora · " + booking.customerName),
    "LOCATION:" + esc(booking.venue),
    "STATUS:" + (booking.status === "cancelled" ? "CANCELLED" : booking.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    lines
      .map((line) => {
        let result = "",
          chunk = "",
          n = 0;
        for (const ch of line) {
          const len = new TextEncoder().encode(ch).length;
          if (n + len > 74) {
            result += chunk + "\r\n ";
            chunk = "";
            n = 1;
          }
          chunk += ch;
          n += len;
        }
        return result + chunk;
      })
      .join("\r\n") + "\r\n"
  );
}
