import { matchingCardWording,matchingCardColor } from "./matching-card";
import { SAVE_DATE_HANDLE, validateSaveDateDesign, type SaveDateDesign } from "./save-date-design";
import { magnetPrice, validBulkPricing, keepsakeLineTotal, keepsakeLineSaving } from "./magnet-pricing.mjs";
export { magnetPrice, keepsakeLineTotal, keepsakeLineSaving };
export type BulkPricing = {version:1;unitCents:number;subtotalCents:number;savingCents:number;totalCents:number;bundlePercent:15};
export const keepsakeStore = "https://www.atelierelunora.com";

// These are the shipped add-ons approved for the wedding booking flow.
// Prices and available variants come from the published Shopify products.
export const keepsakeProducts = [
  { handle: "save-the-date-photo-magnets", name: "Save-the-date photo magnets", description: "A personalized announcement for the people you love. Choose your exact quantity, starting at 25. Volume savings apply to every magnet. Includes one matching save-the-date card per magnet.", note: "Available separately or with your wedding booking. Confirm your delivery date with us before ordering.", requiresBooking: false },
  { handle: "the-wedding-magnetic-keepsake-frame", name: "The wedding keepsake frame", description: "A magnetic frame for your favorite wedding memories. Magnets sold separately.", note: "Made to order. Review production timing before purchasing.", requiresBooking: false },
  { handle: "the-wedding-magnetic-keepsake-frame-30-custom-magnets", name: "Frame with custom magnets", description: "Choose your frame size and the photographs for your included magnet collection.", note: "Photos can be selected after your wedding. Review production timing before purchasing.", requiresBooking: false },
  { handle: "after-wedding-couple-magnet-collection", name: "25 extra after-wedding magnets", description: "Add 25 magnets to your included 12-pack for 37 keepsakes in total.", note: "Select your photos after your wedding.", requiresBooking: false },
] as const;

export type KeepsakeVariant = { id: string; name: string; priceCents: number; available: boolean; bulk?: boolean };
export type KeepsakeProduct = { handle: string; name: string; description: string; note: string; requiresBooking: boolean; image: string | null; variants: KeepsakeVariant[] };

export const BOOKING_BUNDLE_PERCENT = 15;
export type KeepsakeBundleDiscount = { percent: 15; originalUnitCents: number; savingCents: number };
export type KeepsakeItem = { handle: string; name: string; variantId: string; variantName: string; quantity: number; bulkPricing?: BulkPricing; unitCents: number; note: string; bundleDiscount?: KeepsakeBundleDiscount; personalization?: SaveDateDesign; personalizationRequested?: boolean; designHash?: string; cardWording?: string; cardColor?:string };
export type KeepsakeSelection = { version: 1; items: KeepsakeItem[]; subtotalCents: number };
export const keepsakeSubtotal = (items: KeepsakeItem[]) => items.reduce((n, item) => n + keepsakeLineTotal(item), 0);
export const keepsakeSavings = (items: {bundleDiscount?:KeepsakeBundleDiscount;bulkPricing?:BulkPricing;quantity:number}[]) => items.reduce((n,item)=>n+keepsakeLineSaving(item),0);
export function bookingBundlePrice(originalUnitCents:number) {
  if(!Number.isSafeInteger(originalUnitCents)||originalUnitCents<0||originalUnitCents>2147483647)throw Error("Review the current keepsake price.");
  const savingCents=Math.round(originalUnitCents*BOOKING_BUNDLE_PERCENT/100);
  return {unitCents:originalUnitCents-savingCents,bundleDiscount:{percent:BOOKING_BUNDLE_PERCENT,originalUnitCents,savingCents} as KeepsakeBundleDiscount};
}
export function bookingKeepsakeItem(product:KeepsakeProduct,variant:KeepsakeVariant,quantity=25):KeepsakeItem {
  if(variant.bulk){
    if(product.handle!==SAVE_DATE_HANDLE || variant.priceCents!==300)throw Error("Review the current magnet price.");
    const bulkPricing=magnetPrice(quantity,true) as BulkPricing;
    return {handle:product.handle,name:product.name,variantId:variant.id,variantName:quantity+" magnets",quantity,unitCents:bulkPricing.unitCents,bulkPricing,note:product.note};
  }
  return {handle:product.handle,name:product.name,variantId:variant.id,variantName:variant.name,quantity:1,note:product.note,...bookingBundlePrice(variant.priceCents)};
}
// A set is one line item. Resolve every ID and reviewed price on the server.
export function resolveKeepsakeSelection(value: unknown, products: KeepsakeProduct[], bundle = false): KeepsakeSelection | null {
  if (!Array.isArray(value) || value.length > keepsakeProducts.length) throw Error("Choose up to one option from each keepsake collection.");
  const seen = new Set<string>();
  const items = value.map((entry): KeepsakeItem => {
    const product = products.find(p => p.variants.some(v => v.id === entry?.variantId));
    const variant = product?.variants.find(v => v.id === entry?.variantId);
    if (!product || !variant?.available || !keepsakeProducts.some(p=>p.handle===product.handle) || seen.has(product.handle) || (!variant.bulk && entry.quantity !== 1)) throw Error("A selected keepsake changed or is unavailable. Return to details, reload the options and review your selection.");
    if((entry.cardWording !== undefined || entry.cardColor !== undefined) && product.handle !== SAVE_DATE_HANDLE) throw Error("Card wording is only available for save-the-date magnets.");
    const cardWording = matchingCardWording(entry.cardWording), cardColor = matchingCardColor(entry.cardColor);
    if(variant.bulk){
      const priced=bookingKeepsakeItem(product,variant,entry.quantity);
      if(!validBulkPricing({...entry,handle:product.handle}) || !Object.keys(priced.bulkPricing!).every(k=>entry.bulkPricing[k]===priced.bulkPricing![k as keyof BulkPricing]))throw Error("Review the current magnet quantity and price.");
      seen.add(product.handle);
      if(entry.personalizationRequested && !entry.personalization)throw Error("Finish your save-the-date photo and date, or choose to personalize later.");
      return {...priced,...(cardWording ? {cardWording} : {}),...(cardColor ? {cardColor} : {}),...(entry.personalization?{personalization:validateSaveDateDesign(entry.personalization)}:{})};
    }
    if(entry.bulkPricing)throw Error("Review the selected keepsake.");
    const priced=bookingBundlePrice(variant.priceCents), supplied=entry.bundleDiscount;
    if(supplied!==undefined ? (!supplied || supplied.percent!==15 || supplied.originalUnitCents!==variant.priceCents || supplied.savingCents!==priced.bundleDiscount.savingCents || entry.unitCents!==priced.unitCents) : entry.unitCents!==variant.priceCents)throw Error("A selected keepsake changed or is unavailable. Return to details, reload the options and review your selection.");
    seen.add(product.handle);
    if (entry.personalizationRequested === true && !entry.personalization) throw Error("Finish your save-the-date photo and date, or choose to personalize later.");
    if (entry.personalization && product.handle !== SAVE_DATE_HANDLE) throw Error("Personalization is only available for save-the-date magnets.");
    const personalization = entry.personalization ? validateSaveDateDesign(entry.personalization) : undefined;
    return { handle: product.handle, name: product.name, variantId: variant.id, variantName: variant.name, quantity: 1, ...(bundle||supplied ? priced : {unitCents:variant.priceCents}), note: product.note, ...(cardWording ? {cardWording} : {}),...(cardColor ? {cardColor} : {}), ...(personalization ? { personalization } : {}) };
  });
  return items.length ? { version: 1, items, subtotalCents: keepsakeSubtotal(items) } : null;
}

export function productUrl(product: KeepsakeProduct, variant?: KeepsakeVariant) {
  const url = new URL("/products/" + product.handle, keepsakeStore);
  if (variant) url.searchParams.set("variant", variant.id);
  return url.toString();
}

export function keepsakeCheckoutUrl(variant: KeepsakeVariant) {
  if (!/^[1-9]\d+$/.test(variant.id) || !variant.available) throw Error("Choose an available product option.");
  // One set/frame, not one item per magnet in the selected pack. This is a
  // normal Shopify product checkout, so shipping and tax are calculated there.
  return new URL(`/cart/${variant.id}:1`, keepsakeStore).toString();
}
