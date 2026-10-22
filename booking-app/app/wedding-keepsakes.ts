export const keepsakeStore = "https://www.atelierelunora.com";

// These are the shipped add-ons approved for the wedding booking flow.
// Prices and available variants come from the published Shopify products.
export const keepsakeProducts = [
  { handle: "save-the-date-photo-magnets", name: "Save-the-date photo magnets", description: "A personalized announcement for the people you love. Choose one complete magnet set.", note: "For confirmed wedding bookings. Confirm your delivery date with us before ordering.", requiresBooking: true },
  { handle: "the-wedding-magnetic-keepsake-frame", name: "The wedding keepsake frame", description: "A magnetic frame for your favorite wedding memories. Magnets sold separately.", note: "Made to order. Review production timing before purchasing.", requiresBooking: false },
  { handle: "the-wedding-magnetic-keepsake-frame-30-custom-magnets", name: "Frame with custom magnets", description: "Choose your frame size and the photographs for your included magnet collection.", note: "Photos can be selected after your wedding. Review production timing before purchasing.", requiresBooking: false },
  { handle: "after-wedding-couple-magnet-collection", name: "25 extra after-wedding magnets", description: "Add 25 magnets to your included 12-pack for 37 keepsakes in total.", note: "Select your photos after your wedding.", requiresBooking: false },
] as const;

export type KeepsakeVariant = { id: string; name: string; priceCents: number; available: boolean };
export type KeepsakeProduct = { handle: string; name: string; description: string; note: string; requiresBooking: boolean; image: string | null; variants: KeepsakeVariant[] };

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
