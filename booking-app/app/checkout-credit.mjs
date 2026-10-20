import { moneyToCents } from "./payment-ledger.mjs";
// Shopify's actual checkout tax is kept separate from the agreed booking amount.
export function checkoutCredit(amountCents, currency, order) {
  const money = (x, nullable = false) =>
    x == null && nullable ? 0 : moneyToCents(x?.presentmentMoney, currency);
  const items = order?.lineItems?.nodes || [];
  if (
    items.length !== 1 ||
    items[0].quantity !== 1 ||
    money(items[0].originalUnitPriceSet) !== amountCents ||
    money(order.totalDiscountsSet, true) !== 0
  )
    throw Error("Invoice contents changed and require owner review.");
  const grandCents = money(order.totalPriceSet),
    taxCents = money(order.totalTaxSet, true),
    currentTaxCents = money(order.currentTotalTaxSet, true),
    received = money(order.totalReceivedSet),
    refunded = money(order.totalRefundedSet);
  if (
    !grandCents ||
    grandCents > 2147483647 ||
    taxCents > grandCents ||
    currentTaxCents > taxCents ||
    received > grandCents ||
    refunded > received ||
    typeof order.taxesIncluded !== "boolean" ||
    grandCents !== amountCents + (order.taxesIncluded ? 0 : taxCents)
  )
    throw Error("Checkout totals require owner review.");
  if (taxCents > 0 && !order.currentTotalTaxSet)
    throw Error("Tax snapshot is unavailable and requires owner review.");
  const net = received - refunded;
  if (order.taxesIncluded)
    return { grandCents, creditCents: net, netAdditionalTaxCents: 0 };
  const receivedTax = Number(
    (BigInt(received) * BigInt(taxCents) + BigInt(grandCents) / 2n) /
      BigInt(grandCents),
  );
  const refundedTax = taxCents - currentTaxCents;
  if (refundedTax > refunded || refundedTax > receivedTax)
    throw Error("Refund tax allocation requires owner review.");
  const netAdditionalTaxCents = receivedTax - refundedTax,
    creditCents = net - netAdditionalTaxCents;
  if (creditCents < 0 || creditCents > amountCents)
    throw Error("Payment allocation requires owner review.");
  return { grandCents, creditCents, netAdditionalTaxCents };
}
