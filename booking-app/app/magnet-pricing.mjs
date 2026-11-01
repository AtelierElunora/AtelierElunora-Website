// Shared quantity schedule. All units receive the reached tier; round the
// booking percentage once on the complete line. Shopify truncates fractional
// discount cents (verified with DraftOrderCalculate for 73 and 101 magnets).
export const MAGNET_MINIMUM = 25;
export const MAGNET_TIERS = [{minimum:25,unitCents:300},{minimum:50,unitCents:250},{minimum:100,unitCents:225},{minimum:250,unitCents:200}];
export function magnetPrice(quantity, bundled = false) {
  if (!Number.isSafeInteger(quantity) || quantity < MAGNET_MINIMUM || quantity > Math.floor(2147483647/300)) throw Error("Enter a whole-number quantity of at least 25 magnets.");
  const tier = MAGNET_TIERS.findLast(t => quantity >= t.minimum);
  const subtotalCents = quantity * tier.unitCents;
  const savingCents = bundled ? Math.floor(subtotalCents * 15 / 100) : 0;
  return {version:1,unitCents:tier.unitCents,subtotalCents,savingCents,totalCents:subtotalCents-savingCents,bundlePercent:bundled?15:0};
}
export function validBulkPricing(item) {
  try {
    if(item?.handle !== "save-the-date-photo-magnets" || item.bundleDiscount || item.bulkPricing?.bundlePercent !== 15) return false;
    const expected = magnetPrice(item.quantity, true);
    return item.unitCents === expected.unitCents && Object.keys(expected).every(k => item.bulkPricing[k] === expected[k]);
  } catch { return false; }
}
export const keepsakeLineTotal = item => item.bulkPricing?.totalCents ?? item.unitCents * item.quantity;
export const keepsakeLineSaving = item => item.bulkPricing?.savingCents ?? (item.bundleDiscount?.savingCents || 0)*item.quantity;
