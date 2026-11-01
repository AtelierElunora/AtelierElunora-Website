import { useEffect, useRef } from "react";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SaveDateDesigner, type PreparedSaveDate, type SaveDatePreview } from "../SaveDateDesigner";

const parents = new Set(["https://www.atelierelunora.com", "https://atelierelunora.com", "https://atelier-elunora-gallery-test.myshopify.com"]);
export const headers = () => ({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "frame-ancestors https://www.atelierelunora.com https://atelierelunora.com https://atelier-elunora-gallery-test.myshopify.com" });
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url), parent = url.searchParams.get("parentOrigin") || "https://www.atelierelunora.com", channel = url.searchParams.get("channel") || "";
  if (!parents.has(parent) || !/^[a-f0-9-]{36}$/.test(channel)) throw new Response("Open this designer from the save-the-date product page.", { status: 400 });
  return { parent, channel, customColors:url.searchParams.get("previewVersion")==="20261027-lettering-colors" };
}
export default function SaveDateWidget() {
  const { parent, channel, customColors } = useLoaderData<typeof loader>(), sequence = useRef(0);
  useEffect(() => {
    const report = () => window.parent.postMessage({ type: "elunora:save-date-height", channel, height: Math.ceil(document.querySelector(".save-date-standalone")?.getBoundingClientRect().height || 900) }, parent);
    const observer = new ResizeObserver(report); observer.observe(document.body); report();
    return () => { observer.disconnect(); sequence.current++; };
  }, [parent, channel]);
  function preview(value: SaveDatePreview | null) {
    window.parent.postMessage({type:"elunora:save-date-preview",channel,preview:value},parent);
  }
  async function ready(value: PreparedSaveDate | null) {
    const current = ++sequence.current;
    if (!value) { window.parent.postMessage({ type: "elunora:save-date-ready", channel, ready: false }, parent); return; }
    const [original, print] = await Promise.all([value.original.arrayBuffer(), value.print.arrayBuffer()]);
    if (current !== sequence.current) return;
    const { photoDataUrl: _photo, ...design } = value.design;
    window.parent.postMessage({ type: "elunora:save-date-ready", channel, ready: true, design, original: { name: value.original.name, type: value.original.type, bytes: original }, print: { type: "image/png", bytes: print } }, parent, [original, print]);
  }
  return <main className="save-date-standalone"><SaveDateDesigner customColors={customColors} onChange={() => {}} onPreview={preview} onPrepared={value => void ready(value)}/></main>;
}
