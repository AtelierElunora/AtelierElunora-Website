import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentPlan, reconcileOrder, moneyToCents} from './ledger.mjs';
const booking = {id:'booking-test',shop:'test.myshopify.com',currency:'USD',totalCents:100000,receipts:[]};
const link = {bookingId:booking.id,shop:booking.shop,orderId:'gid://shopify/Order/1',paymentId:'payment-test',kind:'prepayment',expectedGrandTotalCents:30000};
function order(received='300.00',refunded='0.00',updatedAt='2026-10-06T12:00:00Z') {
  return {id:link.orderId,updatedAt,customAttributes:[{key:'elunora_booking_id',value:booking.id},{key:'elunora_payment_id',value:link.paymentId}],totalReceivedSet:{presentmentMoney:{amount:received,currencyCode:'USD'}},totalRefundedSet:{presentmentMoney:{amount:refunded,currencyCode:'USD'}}};
}
test('30% paid never marks the entire wedding paid in full',()=>{
  assert.deepEqual(paymentPlan(100000,30),{prepaymentCents:30000,fullPaymentCents:100000,balanceCents:100000});
  const result=reconcileOrder(booking,link,order());
  assert.equal(result.paymentStatus,'partially_paid');assert.equal(result.remainingCents,70000);
  assert.equal(paymentPlan(100000,30,result.paidCents).balanceCents,70000);
});
test('replayed payment event does not double count',()=>{
  const first=reconcileOrder(booking,link,order());assert.deepEqual(reconcileOrder(first,link,order()),first);
});
test('balance receipt marks paid in full only when the whole quote is covered',()=>{
  const first=reconcileOrder(booking,link,order());
  const balanceLink={...link,kind:'balance',orderId:'gid://shopify/Order/2',paymentId:'balance-test',expectedGrandTotalCents:70000};
  const balanceOrder={...order('700.00'),id:balanceLink.orderId,customAttributes:[{key:'elunora_booking_id',value:booking.id},{key:'elunora_payment_id',value:balanceLink.paymentId}]};
  const result=reconcileOrder(first,balanceLink,balanceOrder);assert.equal(result.paymentStatus,'paid_in_full');assert.equal(result.remainingCents,0);
});
test('refund changes net receipts and older events cannot undo it',()=>{
  const paid=reconcileOrder(booking,link,order());
  const refunded=reconcileOrder(paid,link,order('300.00','100.00','2026-10-07T12:00:00Z'));
  assert.equal(refunded.paidCents,20000);assert.equal(refunded.remainingCents,80000);
  assert.deepEqual(reconcileOrder(refunded,link,order()),refunded);
});
test('reject unrelated orders, currencies, excess refunds and altered snapshots',()=>{
  assert.throws(()=>reconcileOrder(booking,{...link,shop:'other.myshopify.com'},order()));
  assert.throws(()=>reconcileOrder(booking,link,{...order(),id:'other-order'}));
  assert.throws(()=>reconcileOrder(booking,link,order('300.00','301.00')));
  assert.throws(()=>reconcileOrder(booking,link,order('301.00')));
  assert.throws(()=>moneyToCents({amount:'300.00',currencyCode:'CAD'},'USD'));
  assert.throws(()=>reconcileOrder(reconcileOrder(booking,link,order()),link,order('200.00')));
});
test('cent rounding stays exact and unsupported terms fail',()=>{
  assert.equal(paymentPlan(10001,30).prepaymentCents,3000);
  assert.equal(moneyToCents({amount:'0.29',currencyCode:'USD'},'USD'),29);
  assert.throws(()=>paymentPlan(1000,100));assert.throws(()=>paymentPlan(-1,30));
});
