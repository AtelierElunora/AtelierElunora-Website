import { moneyToCents } from "./payment-ledger.mjs";
const review = () => { throw Error("Combined checkout contents or refund allocation require owner review."); };
const attr = (item,key) => item.customAttributes?.find(a => a.key === key)?.value;
export function validateMixedLines(plan, amount, currency, connection, paymentId) {
  if (plan?.version !== 1 || !plan.items?.length || plan.items.length > 4 || connection?.pageInfo?.hasNextPage !== false) review();
  const lines=connection.nodes;
  if (!Array.isArray(lines) || lines.length !== plan.items.length+1) review();
  const money = value => moneyToCents(value?.presentmentMoney,currency);
  const service=lines.filter(l=>!l.variant && attr(l,"_elunora_service_payment")===paymentId);
  if(service.length!==1 || service[0].quantity!==1 || money(service[0].originalUnitPriceSet)!==amount || service[0].requiresShipping!==false)review();
  const ids=new Set();
  let subtotal=0;
  for(const item of plan.items){
    if(item.quantity!==1 || !Number.isSafeInteger(item.unitCents) || item.unitCents<0 || ids.has(item.variantId))review();
    ids.add(item.variantId);
    const matching=lines.filter(l=>l.variant?.id==="gid://shopify/ProductVariant/"+item.variantId);
    if(matching.length!==1 || matching[0].quantity!==1 || matching[0].requiresShipping!==true || money(matching[0].originalUnitPriceSet)!==item.unitCents)review();
    subtotal+=item.unitCents;
  }
  if(subtotal!==plan.subtotalCents)review();
  return {service:service[0],subtotal};
}
// A combined purchase is credited only after full capture. Refund line items,
// shipping and tax must reconcile exactly; unallocated adjustments retain the
// previous verified credit and are surfaced for owner review.
export function mixedCheckoutCredit(amount,currency,order,plan,paymentId){
  const {service,subtotal}=validateMixedLines(plan,amount,currency,order?.lineItems,paymentId);
  const money = value => moneyToCents(value?.presentmentMoney,currency);
  const grandCents=money(order.totalPriceSet),tax=money(order.totalTaxSet),currentTax=money(order.currentTotalTaxSet);
  if(order.shippingLines?.pageInfo?.hasNextPage!==false || !Array.isArray(order.shippingLines?.nodes))review();
  // Original shipping lines retain their price across returns. The order's
  // shipping summary is not used to infer pre-refund charges.
  const shipping=order.shippingLines.nodes.reduce((n,l)=>n+money(l.originalPriceSet),0);
  const received=money(order.totalReceivedSet),refunded=money(order.totalRefundedSet);
  if(typeof order.taxesIncluded!=="boolean" || money(order.totalDiscountsSet)!==0 || grandCents!==amount+subtotal+shipping+(order.taxesIncluded?0:tax) || grandCents>2147483647 || currentTax>tax || refunded>received || received>grandCents || (received!==0&&received!==grandCents))review();

  if(!Array.isArray(order.refunds) || order.refunds.length>=20)review();
  const allLines=new Map(order.lineItems.nodes.map(l=>[l.id,l]));
  const quantities=new Map(),principals=new Map();
  let refundTotal=0,refundTax=0,serviceRefund=0,productRefund=0,shippingRefund=0;
  for(const r of order.refunds){
    if(r.refundLineItems?.pageInfo?.hasNextPage!==false || r.refundShippingLines?.pageInfo?.hasNextPage!==false || r.orderAdjustments?.pageInfo?.hasNextPage!==false || r.orderAdjustments.nodes.length)review();
    let allocated=0;
    for(const l of r.refundLineItems.nodes){
      const original=allLines.get(l.lineItem?.id);
      if(!original || !Number.isSafeInteger(l.quantity) || l.quantity<1)review();
      const qty=(quantities.get(original.id)||0)+l.quantity,principal=money(l.subtotalSet),taxRefund=money(l.totalTaxSet);
      const principalTotal=(principals.get(original.id)||0)+principal;
      if(qty>original.quantity || principalTotal>money(original.originalUnitPriceSet)*original.quantity)review();
      quantities.set(original.id,qty);principals.set(original.id,principalTotal);
      if(original.id===service.id)serviceRefund+=principal;else productRefund+=principal;
      refundTax+=taxRefund;allocated+=principal+(order.taxesIncluded?0:taxRefund);
    }
    for(const l of r.refundShippingLines.nodes){
      const principal=money(l.subtotalAmountSet),taxRefund=money(l.taxAmountSet);
      shippingRefund+=principal;refundTax+=taxRefund;allocated+=principal+(order.taxesIncluded?0:taxRefund);
    }
    if(allocated!==money(r.totalRefundedSet))review();
    refundTotal+=allocated;
  }
  if(refundTotal!==refunded || refundTax!==tax-currentTax || serviceRefund>amount || productRefund>subtotal || shippingRefund>shipping || (!received&&refunded))review();
  return {grandCents,creditCents:received?amount-serviceRefund:0,netAdditionalTaxCents:received&&!order.taxesIncluded?currentTax:0,keepsakeCreditCents:received?subtotal-productRefund:0,shippingCents:received?shipping-shippingRefund:0};
}
