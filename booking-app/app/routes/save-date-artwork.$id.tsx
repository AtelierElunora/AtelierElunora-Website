import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { validArtworkLink, designSummary } from "../save-date-artwork.server";
import { SAVE_DATE_HANDLE, photoBytes } from "../save-date-design";
import {renderSaveDateSvg} from "../save-date-fonts.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const booking = await db.weddingBooking.findUnique({ where: { id: params.id } });
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src data:; sandbox" };
  if (!booking) return new Response("Artwork link unavailable", { status: 404, headers });
  const data = JSON.parse(booking.detailsJson), url = new URL(request.url);
  const plans = [data.keepsakes, ...Object.values(data.keepsakePayments || {})] as {items?: {handle:string;personalization?:any}[]}[];
  const design = plans.flatMap(plan=>plan?.items || []).filter(item=>item.handle===SAVE_DATE_HANDLE && item.personalization).map(item=>item.personalization).find(d=>{try{return designSummary(d).designHash===url.searchParams.get("hash");}catch{return false;}});
  if (!design || !validArtworkLink(booking, design, url)) return new Response("Artwork link unavailable", { status: 404, headers });
  const photo = url.searchParams.get("kind") === "photo";
  return new Response(photo ? Uint8Array.from(photoBytes(design.photoDataUrl)).buffer : renderSaveDateSvg(design), { headers: { ...headers, "Content-Type": photo ? "image/jpeg" : "image/svg+xml; charset=utf-8", "Content-Disposition": `attachment; filename="atelier-elunora-save-the-date.${photo ? "jpg" : "svg"}"` } });
}
