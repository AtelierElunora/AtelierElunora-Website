import test from "node:test";
import assert from "node:assert/strict";
import {mixedCheckoutCredit,validateMixedLines} from "../app/mixed-checkout.mjs";
const m=n=>({presentmentMoney:{amount:(n/100).toFixed(2),currencyCode:"USD"}});
const plan={version:1,items:[{variantId:"67923044860192",quantity:1,unitCents:14900}],subtotalCents:14900};
const service={id:"service",quantity:1,requiresShipping:false,variant:null,customAttributes:[{key:"_elunora_service_payment",value:"p"}],originalUnitPriceSet:m(44850)};
const product={id:"magnets",quantity:1,requiresShipping:true,variant:{id:"gid://shopify/ProductVariant/67923044860192"},originalUnitPriceSet:m(14900)};
const connection=nodes=>({nodes,pageInfo:{hasNextPage:false}});
const base={taxesIncluded:false,lineItems:connection([service,product]),shippingLines:connection([{originalPriceSet:m(1000)}]),refunds:[],totalShippingPriceSet:m(1000),totalPriceSet:m(66725),totalTaxSet:m(5975),currentTotalTaxSet:m(5975),totalDiscountsSet:m(0),totalReceivedSet:m(66725),totalRefundedSet:m(0)};
const allocate=o=>mixedCheckoutCredit(44850,"USD",o,plan,"p");
const refund=(line,subtotal,tax,shipping=0)=>({totalRefundedSet:m(subtotal+tax+shipping),orderAdjustments:connection([]),refundLineItems:connection(line?[{quantity:1,lineItem:{id:line},subtotalSet:m(subtotal),totalTaxSet:m(tax)}]:[]),refundShippingLines:connection(shipping?[{subtotalAmountSet:m(shipping),taxAmountSet:m(0)}]:[])});
test("30% wedding prepayment plus full keepsake, shipping and tax credits only the wedding principal",()=>{
 const result=allocate(base);
 assert.equal(result.creditCents,44850);assert.equal(result.keepsakeCreditCents,14900);assert.equal(result.shippingCents,1000);
 assert.equal(149500-result.creditCents,104650);
 const full={...base,lineItems:connection([{...service,originalUnitPriceSet:m(149500)},product]),totalPriceSet:m(165400),totalTaxSet:m(0),currentTotalTaxSet:m(0),totalReceivedSet:m(165400)};
 assert.equal(mixedCheckoutCredit(149500,"USD",full,plan,"p").creditCents,149500);
});
test("product refund never removes wedding credit; service refund never removes product credit",()=>{
 const productRefund={...base,refunds:[refund("magnets",14900,1490)],totalRefundedSet:m(16390),currentTotalTaxSet:m(4485)};
 assert.equal(allocate(productRefund).creditCents,44850);assert.equal(allocate(productRefund).keepsakeCreditCents,0);
 const serviceRefund={...base,refunds:[refund("service",44850,4485)],totalRefundedSet:m(49335),currentTotalTaxSet:m(1490)};
 assert.equal(allocate(serviceRefund).creditCents,0);assert.equal(allocate(serviceRefund).keepsakeCreditCents,14900);
 assert.deepEqual(allocate(productRefund),allocate(productRefund));
});
test("shipping-only and full refunds allocate without changing unrelated principal",()=>{
 assert.equal(allocate({...base,refunds:[refund(null,0,0,1000)],totalRefundedSet:m(1000)}).creditCents,44850);
 const all={...base,refunds:[refund("service",44850,4485),refund("magnets",14900,1490,1000)],totalRefundedSet:m(66725),currentTotalTaxSet:m(0)};
 assert.equal(allocate(all).creditCents,0);assert.equal(allocate(all).keepsakeCreditCents,0);
});
test("edited lines, wrong variants, prices, truncation, discounts and unallocated refunds require review",()=>{
 for(const change of [
 {lineItems:connection([service,{...product,quantity:2}])},
 {lineItems:connection([service,{...product,originalUnitPriceSet:m(1)}])},
 {lineItems:connection([service,{...product,variant:{id:"gid://shopify/ProductVariant/other"}}])},
 {lineItems:{...base.lineItems,pageInfo:{hasNextPage:true}}},
 {totalDiscountsSet:m(100)},{totalReceivedSet:m(100)},
 {totalRefundedSet:m(100)},{currentTotalTaxSet:m(0)},
 {totalPriceSet:m(66726)},
 {refunds:[{...refund("magnets",14900,1490),orderAdjustments:connection([{id:"adjustment"}])}],totalRefundedSet:m(16390),currentTotalTaxSet:m(4485)},
 ]) assert.throws(()=>allocate({...base,...change}),/review/);
 assert.throws(()=>validateMixedLines({...plan,subtotalCents:1},44850,"USD",base.lineItems,"p"),/review/);
 assert.equal(allocate({...base,totalReceivedSet:m(0)}).creditCents,0);
});
