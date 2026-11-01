import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import db from "./db.server";
import { locked } from "./booking.server";
import { liveBookingShop } from "./live-store";
import {
  conversionCsv,
  eligibleGoogleOutcome,
  GOOGLE_ADS_ATTRIBUTION_KIND,
  GOOGLE_ADS_BOOKED_KIND,
  GOOGLE_ADS_QUALIFIED_KIND,
  GOOGLE_ADS_WINDOW_MS,
  type GoogleAttribution,
} from "./google-ads";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
import { googleAdsEventId } from "./google-ads-id.server";
export { googleAdsEventId } from "./google-ads-id.server";
const privateHeaders = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
export { privateHeaders as googleAdsPrivateHeaders };
type FeedConfig = {
  enabled?: boolean;
  username?: string;
  passwordHash?: string;
  createdAt?: string;
  lastFetchedAt?: string;
};
export function validFeedAuthorization(
  header: string | null,
  config: FeedConfig,
) {
  if (
    !config.enabled ||
    !config.username ||
    !config.passwordHash ||
    !header?.startsWith("Basic ") ||
    header.length > 1024
  )
    return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8"),
    split = decoded.indexOf(":");
  if (split < 1 || decoded.slice(0, split) !== config.username) return false;
  const expected = Buffer.from(config.passwordHash, "hex"),
    actual = Buffer.from(hash(decoded.slice(split + 1)), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function googleAdsDashboard(shop: string) {
  const settings = await db.bookingSettings.findUniqueOrThrow({
      where: { shop },
    }),
    config: FeedConfig = JSON.parse(settings.configJson).googleAdsFeed || {};
  const events = await db.bookingEvent.findMany({
    where: {
      shop,
      kind: { in: [GOOGLE_ADS_ATTRIBUTION_KIND, GOOGLE_ADS_QUALIFIED_KIND] },
    },
    select: { bookingId: true, kind: true, text: true },
  });
  return {
    enabled: config.enabled === true,
    username: config.username || "",
    lastFetchedAt: config.lastFetchedAt || "",
    qualified: events
      .filter(
        (e) => e.kind === GOOGLE_ADS_QUALIFIED_KIND && e.text === "qualified",
      )
      .map((e) => e.bookingId),
    attributed: events
      .filter((e) => e.kind === GOOGLE_ADS_ATTRIBUTION_KIND)
      .map((e) => e.bookingId),
  };
}
export async function createGoogleAdsFeed(shop: string) {
  if (shop !== liveBookingShop)
    throw Error(
      "Google Ads export is available only for the production store.",
    );
  const password = randomBytes(32).toString("base64url"),
    username = "google-ads-" + randomBytes(8).toString("hex");
  await locked(shop, async (tx) => {
    const s = await tx.bookingSettings.findUniqueOrThrow({ where: { shop } }),
      config = JSON.parse(s.configJson);
    config.googleAdsFeed = {
      enabled: true,
      username,
      passwordHash: hash(password),
      createdAt: new Date().toISOString(),
    };
    await tx.bookingSettings.update({
      where: { shop },
      data: { configJson: JSON.stringify(config) },
    });
  });
  return { username, password };
}
export async function disableGoogleAdsFeed(shop: string) {
  await locked(shop, async (tx) => {
    const s = await tx.bookingSettings.findUniqueOrThrow({ where: { shop } }),
      config = JSON.parse(s.configJson);
    config.googleAdsFeed = { enabled: false };
    await tx.bookingSettings.update({
      where: { shop },
      data: { configJson: JSON.stringify(config) },
    });
  });
}
export async function setGoogleAdsQualified(
  shop: string,
  id: string,
  qualified: boolean,
) {
  await locked(shop, async (tx) => {
    const lead = await tx.bookingLead.findFirstOrThrow({ where: { shop, id } });
    if (qualified && lead.status === "declined")
      throw Error("Reopen the inquiry before marking it qualified.");
    const eventId = googleAdsEventId(shop, id, GOOGLE_ADS_QUALIFIED_KIND);
    const old = await tx.bookingEvent.findUnique({ where: { id: eventId } });
    // Changing a checkbox cannot manufacture a new conversion time on later retries.
    await tx.bookingEvent.upsert({
      where: { id: eventId },
      create: {
        id: eventId,
        shop,
        bookingId: id,
        kind: GOOGLE_ADS_QUALIFIED_KIND,
        text: qualified ? "qualified" : "never-qualified",
      },
      update: {
        text: qualified
          ? "qualified"
          : old?.text === "never-qualified"
            ? "never-qualified"
            : "not-qualified",
        ...(old?.text === "never-qualified" && qualified
          ? { createdAt: new Date() }
          : {}),
      },
    });
  });
}
export async function googleAdsFeed(
  request: Request,
  shop: string,
  kind: string,
) {
  const setupPreview = ["qualified-preview", "booked-preview"].includes(kind);
  if (setupPreview) kind = kind.replace(/-preview$/, "");
  if (shop !== liveBookingShop || !["qualified", "booked"].includes(kind))
    return new Response("Not found", { status: 404, headers: privateHeaders });
  const settings = await db.bookingSettings.findUnique({ where: { shop } }),
    config: FeedConfig = settings
      ? JSON.parse(settings.configJson).googleAdsFeed || {}
      : {};
  if (!validFeedAuthorization(request.headers.get("Authorization"), config))
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        ...privateHeaders,
        "WWW-Authenticate": 'Basic realm="Google Ads conversions"',
      },
    });
  const now = new Date(),
    since = new Date(now.getTime() - GOOGLE_ADS_WINDOW_MS);
  const outcomes = await db.bookingEvent.findMany({
    where: {
      shop,
      kind:
        kind === "qualified"
          ? GOOGLE_ADS_QUALIFIED_KIND
          : GOOGLE_ADS_BOOKED_KIND,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
  });
  const rows: { gclid: string; time: Date; orderId: string }[] = [];
  const seen = new Set<string>();
  for (const event of outcomes) {
    if (kind === "qualified" && event.text !== "qualified") continue;
    const leadId = kind === "qualified" ? event.bookingId : event.text;
    const lead = await db.bookingLead.findFirst({
      where: { shop, id: leadId },
    });
    if (
      !lead ||
      lead.status === "declined" ||
      (kind === "booked" && lead.bookingId !== event.bookingId)
    )
      continue;
    const record: { shop: string; kind: string; text: string } | null =
      await db.bookingEvent.findUnique({
        where: {
          id: googleAdsEventId(shop, leadId, GOOGLE_ADS_ATTRIBUTION_KIND),
        },
      });
    if (
      !record ||
      record.shop !== shop ||
      record.kind !== GOOGLE_ADS_ATTRIBUTION_KIND
    )
      continue;
    let attribution: GoogleAttribution;
    try {
      attribution = JSON.parse(record.text);
    } catch {
      continue;
    }
    if (!eligibleGoogleOutcome(attribution, event.createdAt, now)) continue;
    if (kind === "booked") {
      const booking = await db.weddingBooking.findFirst({
        where: {
          id: event.bookingId,
          shop,
          status: "confirmed",
          paidCents: { gt: 0 },
        },
      });
      if (!booking) continue;
    }
    const orderId =
      "elunora-" + hash(shop + ":" + event.bookingId + ":" + kind);
    if (seen.has(orderId)) continue;
    seen.add(orderId);
    rows.push({ gclid: attribution.gclid, time: event.createdAt, orderId });
  }
  // Fetching is not confirmation that Google imported or attributed any row.
  const stillAuthorized = await locked(shop, async (tx) => {
    const s = await tx.bookingSettings.findUniqueOrThrow({ where: { shop } }),
      c = JSON.parse(s.configJson);
    if (
      !validFeedAuthorization(
        request.headers.get("Authorization"),
        c.googleAdsFeed || {},
      )
    )
      return false;
    c.googleAdsFeed.lastFetchedAt = now.toISOString();
    await tx.bookingSettings.update({
      where: { shop },
      data: { configJson: JSON.stringify(c) },
    });
    return true;
  });
  if (!stillAuthorized)
    return new Response("Unauthorized", {
      status: 401,
      headers: privateHeaders,
    });
  return new Response(
    conversionCsv(
      rows,
      setupPreview || new URL(request.url).searchParams.get("setup_preview") === "true",
    ),
    {
      headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8" },
    },
  );
}
