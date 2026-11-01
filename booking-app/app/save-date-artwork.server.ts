import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { photoBytes, validateSaveDateDesign, type SaveDateDesign, type SaveDateSummary } from "./save-date-design";
import {letteringLabel} from "./lettering-color";
import {fontFor} from "./save-date-fonts";

export function designSummary(input: SaveDateDesign): SaveDateSummary {
  const { photoDataUrl, border, ...metadata } = validateSaveDateDesign(input);
  const borderSummary=border?{theme:border.theme,color:border.color,width:border.width,...(border.artwork?{artworkHash:createHash("sha256").update(border.artwork).digest("hex")}:{})}:undefined;
  const summary = { ...metadata,...(borderSummary?{border:borderSummary}:{}), photoHash: createHash("sha256").update(photoBytes(photoDataUrl)).digest("hex") };
  return { ...summary, designHash:createHash("sha256").update(JSON.stringify(summary)).digest("hex") };
}
const secret = () => { const key = process.env.SHOPIFY_API_SECRET; if (!key) throw Error("Artwork links are not configured."); return key; };
const sign = (id: string, shop: string, hash: string, until: string, kind: string) => createHmac("sha256", secret()).update(JSON.stringify(["save-date-artwork-v1", id, shop, hash, until, kind])).digest("hex");
type Booking = { id: string; shop: string; weddingDate: string };
export function saveDateArtworkAttributes(booking: Booking, design: SaveDateDesign) {
  const summary = designSummary(design), until = String(Math.floor((Date.parse(booking.weddingDate + "T12:00:00Z") + 366 * 86400000) / 1000));
  const origin = new URL(process.env.SHOPIFY_APP_URL || "https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net");
  if (origin.protocol !== "https:" && process.env.NODE_ENV === "production") throw Error("Artwork delivery needs a secure app URL.");
  const link = (kind: string) => {
    const url = new URL("/save-date-artwork/" + encodeURIComponent(booking.id), origin);
    for (const [key, value] of Object.entries({ kind, until, hash:summary.designHash, signature: sign(booking.id, booking.shop, summary.designHash, until, kind) })) url.searchParams.set(key, value);
    return url.toString();
  };
  return [{ key: "Save-the-date design", value: link("design") }, { key: "Cropped photograph", value: link("photo") }, { key: "Top wording", value: summary.topEnabled ? summary.topText : "Off — date only" }, { key: "Bottom date", value: summary.bottomText }, { key: "Lettering", value: letteringLabel(summary.ink) }, ...(summary.typography?[{key:"Top lettering",value:summary.topEnabled?`${fontFor(summary.typography.topFont).label}, ${summary.typography.topSize} pt`:"Off"},{key:"Date lettering",value:`${fontFor(summary.typography.bottomFont).label}, ${summary.typography.bottomSize} pt`}]:[]), { key: "_elunora_design_sha256", value: summary.designHash }];
}
export function validArtworkLink(booking: Booking, design: SaveDateDesign, url: URL, now = Date.now()) {
  const until = url.searchParams.get("until") || "", kind = url.searchParams.get("kind") || "", signature = url.searchParams.get("signature") || "";
  if (!/^\d{10}$/.test(until) || !["design", "photo"].includes(kind) || !/^[a-f0-9]{64}$/.test(signature) || Number(until) * 1000 <= now) return false;
  const hash = designSummary(design).designHash;
  if(url.searchParams.get("hash")!==hash)return false;
  const expected = sign(booking.id, booking.shop, hash, until, kind);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
