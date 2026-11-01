import {normalizeBorder,borderSvg,type PhotoBorder} from "./magnet-borders.mjs";
import {letteringHex,lightLettering,type LetteringInk} from "./lettering-color";
import {fontFor, fontSupports, type SaveDateFont} from "./save-date-fonts";
export type SaveDateTypography = {topFont:SaveDateFont;bottomFont:SaveDateFont;topSize:number;bottomSize:number};
export type SaveDateDesign = { version: 1; topEnabled: boolean; topText: string; bottomText: string; ink: LetteringInk; photoDataUrl: string; typography?:SaveDateTypography; border?:PhotoBorder };
export type SaveDateSummary = Omit<SaveDateDesign, "photoDataUrl" | "border"> & { photoHash: string; designHash: string; border?:Omit<PhotoBorder,"artwork"> & {artworkHash?:string} };
export const SAVE_DATE_HANDLE = "save-the-date-photo-magnets";
export const PHOTO_LIMIT = 450 * 1024;
export const DESIGN_SIZE = 1000;

export function suggestedDate(value = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
}

// Accept only the bounded, square JPEG produced by the designer. SVG, HTML,
// external URLs and arbitrary base64 payloads never enter booking storage.
export function photoBytes(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length > Math.ceil(PHOTO_LIMIT / 3) * 4 + 24 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error("Choose a valid save-the-date photograph.");
  let binary: string;
  try { binary = atob(value.slice(23)); } catch { throw Error("Choose a valid save-the-date photograph."); }
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (bytes.length > PHOTO_LIMIT || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw Error("Choose a valid save-the-date photograph.");
  let offset = 2, dimensions = false;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if ([192,193,194].includes(marker)) {
      const h = (bytes[offset + 3] << 8) | bytes[offset + 4], w = (bytes[offset + 5] << 8) | bytes[offset + 6];
      dimensions = h === DESIGN_SIZE && w === DESIGN_SIZE;
      break;
    }
    offset += length;
  }
  if (!dimensions) throw Error("Prepare the photograph with the save-the-date designer before continuing.");
  return bytes;
}

export function validateSaveDateDesign(value: unknown): SaveDateDesign {
  const d = value as Partial<SaveDateDesign> | null;
  if (!d || d.version !== 1 || typeof d.topEnabled !== "boolean") throw Error("Review your save-the-date design.");
  const ink = d.ink === "white" || d.ink === "olive" ? d.ink : letteringHex(d.ink) as LetteringInk;
  const text = (v: unknown, required: boolean) => {
    if (typeof v !== "string" || v.length > 60 || /[\u0000-\u001f\u007f]/.test(v) || (required && !v.trim())) throw Error("Enter your save-the-date wording and date (up to 60 characters per line).");
    return v.normalize("NFC").trim();
  };
  const topText = text(d.topText, d.topEnabled), bottomText = text(d.bottomText, true);
  let typography:SaveDateTypography|undefined;
  if(d.typography!==undefined){
    const t=d.typography;
    if(!t || !["script","modern"].includes(t.topFont) || !["script","modern"].includes(t.bottomFont) || ![t.topSize,t.bottomSize].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=8&&n<=24&&Number.isInteger(n*2)))throw Error("Choose an Atelier font and a text size between 8 and 24 points.");
    if((d.topEnabled&&!fontSupports(topText,t.topFont))||!fontSupports(bottomText,t.bottomFont))throw Error("Your chosen font does not support some characters. Try the other font or use standard letters, numbers and punctuation.");
    typography={topFont:t.topFont,bottomFont:t.bottomFont,topSize:t.topSize,bottomSize:t.bottomSize};
  }
  const border=normalizeBorder(d.border);
  photoBytes(d.photoDataUrl);
  return { version: 1, topEnabled: d.topEnabled, topText, bottomText, ink, photoDataUrl: d.photoDataUrl!, ...(typography?{typography}:{}),...(border?{border}:{}) };
}

export const designDescription = (d: Pick<SaveDateDesign, "topEnabled" | "topText" | "bottomText" | "typography">) =>
  (d.topEnabled ? `Top: ${d.topText}`+(d.typography?` (${fontFor(d.typography.topFont).label}, ${d.typography.topSize} pt)`:"") : "Top line: off") + ` · Bottom: ${d.bottomText}`+(d.typography?` (${fontFor(d.typography.bottomFont).label}, ${d.typography.bottomSize} pt)`:"");

export function saveDateSvg(design: SaveDateDesign, outlinedLines?:string) {
  const d = validateSaveDateDesign(design), ink = letteringHex(d.ink);
  if(d.typography&&!outlinedLines)throw Error("Branded artwork must be rendered with its saved font outlines.");
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const line = (text: string, y: number) => `<text x="500" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-style="italic" font-size="${Math.min(60, 1350 / Math.max(1, Array.from(text).length))}" fill="${ink}" filter="url(#shade)">${escape(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2.5in" height="2.5in" viewBox="0 0 1000 1000">${d.typography?`<title>${escape(designDescription(d))}</title>`:""}<defs><filter id="shade" x="-30%" y="-80%" width="160%" height="260%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="${lightLettering(d.ink) ? "#000" : "#fff"}" flood-opacity=".8"/></filter></defs><image width="1000" height="1000" href="${d.photoDataUrl}"/>${borderSvg(d.border??null)}${outlinedLines??((d.topEnabled ? line(d.topText, 110) : "")+line(d.bottomText, 890))}</svg>`;
}
