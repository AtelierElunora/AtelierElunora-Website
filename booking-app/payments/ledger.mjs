// Exact-cent reconciliation for server-linked, Shopify-verified payment snapshots.
// Call only with a server-linked order fetched from authenticated Admin GraphQL.
const currencies = new Set(['USD', 'CAD', 'EUR', 'GBP']);
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid payment amount');
  return value;
}
export function moneyToCents(money, currency) {
  if (!currencies.has(currency) || money?.currencyCode !== currency || !/^\d+(?:\.\d{1,2})?$/.test(money.amount)) throw new Error('Unsupported or mismatched payment currency');
  const [whole, fraction = ''] = money.amount.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Payment amount exceeds safe range');
  return Number(amount);
}
export function paymentPlan(totalCents, percent, paidCents = 0) {
  cents(totalCents); cents(paidCents);
  if (!totalCents || !Number.isInteger(percent) || percent < 1 || percent > 99) throw new Error('Invalid booking terms');
  // BigInt prevents floating-point errors when rounding the configured percentage.
  const prepaymentCents = Number((BigInt(totalCents) * BigInt(percent) + 50n) / 100n);
  return {prepaymentCents, fullPaymentCents: totalCents, balanceCents: Math.max(0, totalCents - paidCents)};
}
export function reconcileOrder(booking, link, order) {
  if (booking.id !== link.bookingId || booking.shop !== link.shop || link.orderId !== order?.id) throw new Error('Payment is not linked to this booking');
  if (!['prepayment', 'full', 'balance'].includes(link.kind)) throw new Error('Invalid payment kind');
  const attrs = new Map((order.customAttributes || []).map(a => [a.key, a.value]));
  if (attrs.get('elunora_booking_id') !== booking.id || attrs.get('elunora_payment_id') !== link.paymentId) throw new Error('Payment linkage does not match');
  const at = Date.parse(order.updatedAt);
  if (!Number.isFinite(at)) throw new Error('Invalid payment snapshot timestamp');
  const receivedCents = moneyToCents(order.totalReceivedSet?.presentmentMoney, booking.currency);
  const refundedCents = moneyToCents(order.totalRefundedSet?.presentmentMoney, booking.currency);
  if (refundedCents > receivedCents || receivedCents > cents(link.expectedGrandTotalCents)) throw new Error('Payment requires manual amount review');
  const receipt = {orderId: order.id, paymentId: link.paymentId, kind: link.kind, receivedCents, refundedCents, updatedAt: order.updatedAt,creditedCents:link.creditCents===undefined?receivedCents-refundedCents:cents(link.creditCents)};
  const prior = (booking.receipts || []).find(r => r.orderId === order.id);
  if (prior && (prior.paymentId !== receipt.paymentId || prior.kind !== receipt.kind)) throw new Error('Conflicting payment linkage');
  if (prior && Date.parse(prior.updatedAt) === at && (prior.receivedCents !== receivedCents || prior.refundedCents !== refundedCents || (prior.creditedCents??prior.receivedCents-prior.refundedCents)!==receipt.creditedCents)) throw new Error('Conflicting payment snapshot');
  // Retain newer snapshots; duplicates replace one order rather than adding receipts.
  const receipts = (booking.receipts || []).filter(r => r.orderId !== order.id);
  receipts.push(prior && Date.parse(prior.updatedAt) > at ? prior : receipt);
  const paidCents = receipts.reduce((sum, r) => cents(sum + cents(r.creditedCents??(cents(r.receivedCents)-cents(r.refundedCents)))), 0);
  const remainingCents = Math.max(0, cents(booking.totalCents) - paidCents);
  const overpaymentCents = Math.max(0, paidCents - booking.totalCents);
  const paymentStatus = overpaymentCents ? 'overpaid_review' : remainingCents === 0 ? 'paid_in_full' : paidCents ? 'partially_paid' : 'unpaid';
  return {...booking, receipts, paidCents, remainingCents, overpaymentCents, paymentStatus};
}
