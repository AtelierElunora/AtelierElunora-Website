import { useEffect, useState } from "react";
const storefronts = [
  "https://www.atelierelunora.com",
  "https://atelierelunora.com",
];
export function GoogleAdsAttributionFields({
  parentOrigin,
}: {
  parentOrigin: string;
}) {
  const [value, setValue] = useState({ gclid: "", capturedAt: "", consent: "" });
  useEffect(() => {
    if (window.parent === window || !storefronts.includes(parentOrigin)) return;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== parentOrigin ||
        event.data?.type !== "elunora:ads-attribution"
      )
        return;
      const a = event.data.attribution;
      setValue(
        a?.consentGranted === true &&
          /^[A-Za-z0-9_-]{10,200}$/.test(a.gclid || "") &&
          Number.isFinite(Date.parse(a.capturedAt))
          ? { gclid: a.gclid, capturedAt: a.capturedAt, consent: "yes" }
          : { gclid: "", capturedAt: "", consent: "no" },
      );
    };
    window.addEventListener("message", receive);
    const request = () =>
      window.parent.postMessage(
        { type: "elunora:ads-attribution-request" },
        parentOrigin,
      );
    request();
    const timer = window.setInterval(request, 5000);
    return () => {
      window.removeEventListener("message", receive);
      window.clearInterval(timer);
    };
  }, [parentOrigin]);
  return (
    <>
      <input type="hidden" name="googleAdsClickId" value={value.gclid} />
      <input type="hidden" name="googleAdsClickedAt" value={value.capturedAt} />
      <input
        type="hidden"
        name="googleAdsConsent"
        value={value.consent}
      />
    </>
  );
}
