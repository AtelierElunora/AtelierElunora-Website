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

test("shipping principal comes from original shipping lines across returns",()=>{
 const returned={...base,totalShippingPriceSet:m(0),refunds:[refund(null,0,0,1000)],totalRefundedSet:m(1000)};
 assert.equal(allocate(returned).creditCents,44850);assert.equal(allocate(returned).shippingCents,0);
});
test("personalized products must retain the artwork fingerprint from the signed plan",()=>{
 const personalized={...plan,items:[{...plan.items[0],designHash:"a".repeat(64)}]};
 const productWithDesign={...product,customAttributes:[{key:"_elunora_design_sha256",value:"a".repeat(64)}]};
 assert.equal(validateMixedLines(personalized,44850,"USD",connection([service,productWithDesign]),"p").subtotal,14900);
 for(const p of [product,{...productWithDesign,customAttributes:[{key:"_elunora_design_sha256",value:"b".repeat(64)}]}])assert.throws(()=>validateMixedLines(personalized,44850,"USD",connection([service,p]),"p"),/review/);
});

test("15% bundle discounts reconcile only against eligible product lines and net refunds",()=>{
 const discounted={...plan,items:[{...plan.items[0],unitCents:12665,bundleDiscount:{percent:15,originalUnitCents:14900,savingCents:2235}}],subtotalCents:12665};
 const discountedProduct={...product,discountAllocations:[{allocatedAmountSet:m(2235)}]};
 const order={...base,lineItems:connection([service,discountedProduct]),totalDiscountsSet:m(2235),totalPriceSet:m(64337),totalReceivedSet:m(64337),totalTaxSet:m(5822),currentTotalTaxSet:m(5822)};
 // 448.50 service + 126.65 magnets + 10 shipping + 58.22 tax.
 const credit=o=>mixedCheckoutCredit(44850,"USD",o,discounted,"p");
 assert.equal(credit(order).creditCents,44850);assert.equal(credit(order).keepsakeCreditCents,12665);
 const returned={...order,refunds:[refund("magnets",12665,1267)],totalRefundedSet:m(13932),currentTotalTaxSet:m(4555)};
 assert.equal(credit(returned).creditCents,44850);assert.equal(credit(returned).keepsakeCreditCents,0);
 const full={...order,lineItems:connection([{...service,originalUnitPriceSet:m(149500)},discountedProduct]),totalPriceSet:m(168987),totalReceivedSet:m(168987)};
 assert.equal(mixedCheckoutCredit(149500,"USD",full,discounted,"p").creditCents,149500);
 for(const change of [
  {totalDiscountsSet:m(2236)},
  {lineItems:connection([service,product])},
  {lineItems:connection([{...service,discountAllocations:[{allocatedAmountSet:m(2235)}]},product])},
  {lineItems:connection([service,{...discountedProduct,discountAllocations:[{allocatedAmountSet:m(2236)}]}])},
  {refunds:[refund("magnets",14900,1267)],totalRefundedSet:m(16167),currentTotalTaxSet:m(4555)},
 ])assert.throws(()=>credit({...order,...change}),/review/);
 const draftProduct={...product,appliedDiscount:{amountSet:m(2235)}};
 assert.equal(validateMixedLines(discounted,44850,"USD",connection([service,draftProduct]),"p").discountCents,2235);
 assert.throws(()=>validateMixedLines({...discounted,items:[{...discounted.items[0],bundleDiscount:{...discounted.items[0].bundleDiscount,percent:50}}]},44850,"USD",order.lineItems,"p"),/review/);
});

test("volume-priced quantities reconcile exact discounts and partial product refunds without reducing wedding credit",()=>{
 const item={handle:"save-the-date-photo-magnets",variantId:"67923044860192",quantity:73,unitCents:250,bulkPricing:{version:1,unitCents:250,subtotalCents:18250,savingCents:2737,totalCents:15513,bundlePercent:15}};
 const plan={version:1,items:[item],subtotalCents:15513};
 const magnets={...product,quantity:73,originalUnitPriceSet:m(250),discountAllocations:[{allocatedAmountSet:m(2737)}]};
 const order={...base,lineItems:connection([service,magnets]),totalTaxSet:m(0),currentTotalTaxSet:m(0),totalPriceSet:m(61363),totalReceivedSet:m(61363),totalDiscountsSet:m(2737)};
 const credit=o=>mixedCheckoutCredit(44850,"USD",o,plan,"p");
 assert.equal(credit(order).keepsakeCreditCents,15513);assert.equal(credit(order).creditCents,44850);
 const r=refund("magnets",2125,0);r.refundLineItems.nodes[0].quantity=10;
 assert.equal(credit({...order,refunds:[r],totalRefundedSet:m(2125)}).keepsakeCreditCents,13388);
 for(const edit of [{quantity:74},{originalUnitPriceSet:m(200)},{discountAllocations:[{allocatedAmountSet:m(2738)}]}])assert.throws(()=>credit({...order,lineItems:connection([service,{...magnets,...edit}])}));
 assert.throws(()=>validateMixedLines({...plan,items:[{...item,quantity:24}]},44850,"USD",order.lineItems,"p"));
});
