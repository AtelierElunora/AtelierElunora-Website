import { liveBookingShop, developmentBookingShop } from "./live-store";

/** Report only an acknowledged save. No contact data or private booking URLs cross the frame. */
export function createInquiryReporter() {
  const reported = new Set<string>();
  return (result: unknown, shop: string, parentOrigin: string,
    parent: Pick<Window, "postMessage">) => {
    const origins = shop === liveBookingShop
      ? ["https://www.atelierelunora.com", "https://atelierelunora.com", "https://" + liveBookingShop]
      : shop === developmentBookingShop ? ["https://" + developmentBookingShop] : [];
    if (!origins.includes(parentOrigin) || !result || typeof result !== "object") return;
    const saved = result as {saved?: boolean; conversionId?: string};
    if (saved.saved !== true || typeof saved.conversionId !== "string" ||
      !/^[a-f0-9]{64}$/.test(saved.conversionId) || reported.has(saved.conversionId)) return;
    try {
      parent.postMessage({type:"elunora:inquiry-saved", conversionId:saved.conversionId},parentOrigin);
      reported.add(saved.conversionId);
    } catch { /* Analytics must never interrupt a successful inquiry. */ }
  };
}
