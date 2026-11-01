export const GOOGLE_ADS_ATTRIBUTION_KIND = "google_ads_attribution";
export const GOOGLE_ADS_QUALIFIED_KIND = "google_ads_qualified";
export const GOOGLE_ADS_BOOKED_KIND = "google_ads_booked";
export const GOOGLE_ADS_WINDOW_MS = 90 * 86400000;
export const GOOGLE_ADS_NAMES = {
  qualified: "CRM Qualified Wedding Lead",
  booked: "CRM Confirmed Wedding Booking",
};
export type GoogleAttribution = {
  gclid: string;
  capturedAt: string;
  consentAt: string;
};
export function readGoogleAttribution(
  form: FormData,
  now = new Date(),
): GoogleAttribution | null {
  if (form.get("googleAdsConsent") !== "yes") return null;
  const gclid = String(form.get("googleAdsClickId") || "");
  const capturedAt = String(form.get("googleAdsClickedAt") || "");
  const time = Date.parse(capturedAt);
  if (
    !/^[A-Za-z0-9_-]{10,200}$/.test(gclid) ||
    !Number.isFinite(time) ||
    time > now.getTime() + 60000 ||
    now.getTime() - time > GOOGLE_ADS_WINDOW_MS
  )
    return null;
  return {
    gclid,
    capturedAt: new Date(time).toISOString(),
    consentAt: now.toISOString(),
  };
}
export function eligibleGoogleOutcome(
  attribution: GoogleAttribution,
  occurredAt: Date,
  now = new Date(),
) {
  if (!attribution || typeof attribution !== "object") return false;
  const click = Date.parse(attribution.capturedAt),
    consent = Date.parse(attribution.consentAt),
    at = occurredAt.getTime();
  return (
    /^[A-Za-z0-9_-]{10,200}$/.test(attribution.gclid) &&
    Number.isFinite(click) &&
    Number.isFinite(consent) &&
    consent >= click - 60000 &&
    consent <= at &&
    at >= click &&
    at <= now.getTime() &&
    now.getTime() - click <= GOOGLE_ADS_WINDOW_MS
  );
}
export function conversionCsv(
  rows: { gclid: string; time: Date; orderId: string }[],
  includeSetupRow = false,
) {
  const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  return (
    "Google_Click_ID,Conversion_Time,Order_ID,Record_Type\r\n" +
    rows
      .map((r) =>
        [
          r.gclid,
          r.time
            .toISOString()
            .replace("T", " ")
            .replace(/\.\d{3}Z$/, "+00:00"),
          r.orderId,
          "conversion",
        ]
          .map(quote)
          .join(","),
      )
      .join("\r\n") +
    (rows.length ? "\r\n" : "") +
    (includeSetupRow && !rows.length
      ? '"SETUP ONLY: NOT A GOOGLE CLICK ID","2000-01-01 00:00:00+00:00","elunora-schema-test-never-import","setup_test"\r\n'
      : "")
  );
}
