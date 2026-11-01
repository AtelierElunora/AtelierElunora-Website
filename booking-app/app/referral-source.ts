export const referralSources = [
  ["google_search", "Google search"],
  ["google_maps", "Google Maps"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["friend_family", "Friend or family"],
  ["venue_planner", "Wedding venue or planner"],
  ["wedding_event", "Wedding show or event"],
  ["returning_customer", "I’m a returning customer"],
  ["other", "Other"],
] as const;
export type Referral = {referralSource: string; referralDetails: string};
export function readReferral(input: FormData | {referralSource?: unknown; referralDetails?: unknown}, fallback?: Partial<Referral> | null): Referral {
  const raw = input instanceof FormData ? input.get("referralSource") : input.referralSource;
  const detail = input instanceof FormData ? input.get("referralDetails") : input.referralDetails;
  const source = String(raw || "").trim();
  if (!source) return {referralSource: fallback?.referralSource || "", referralDetails: fallback?.referralDetails || ""};
  if (!referralSources.some(([value]) => value === source)) throw Error("Choose a valid answer for how you heard about us.");
  const text = String(detail || "").trim();
  if (source === "other" && text.length > 200) throw Error("Keep your referral details to 200 characters or fewer.");
  return {referralSource: source, referralDetails: source === "other" ? text : ""};
}
export function referralLabel(source?: string | null) {
  return referralSources.find(([value]) => value === source)?.[1] || "Not provided";
}
export function referralDescription(value?: Partial<Referral> | null) {
  return referralLabel(value?.referralSource) + (value?.referralSource === "other" && value.referralDetails ? ` · ${value.referralDetails}` : "");
}
export function summarizeReferrals(leads: Array<Partial<Referral> & {booked?: boolean; bookingId?: string | null}>) {
  const rows = new Map<string, {source: string; label: string; inquiries: number; bookings: Set<string>}>();
  for (const lead of leads) {
    const source = referralSources.some(([s]) => s === lead.referralSource) ? lead.referralSource! : "";
    const row = rows.get(source) || {source, label: referralLabel(source), inquiries: 0, bookings: new Set<string>()};
    row.inquiries++;
    if (lead.booked && lead.bookingId) row.bookings.add(lead.bookingId);
    rows.set(source, row);
  }
  return [...rows.values()].map(r => ({source: r.source, label: r.label, inquiries: r.inquiries, bookings: r.bookings.size})).sort((a,b) => b.inquiries - a.inquiries || a.label.localeCompare(b.label));
}
