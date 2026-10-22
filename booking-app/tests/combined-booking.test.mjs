import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {rm} from "node:fs/promises";
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error("Only disposable SQLite is allowed.");
await build({entryPoints:["tests/server-entry.ts"],bundle:true,format:"esm",platform:"node",packages:"external",outfile:"tests/.combined-booking-bundle.mjs"});
const {db,createBooking,details,invoice,recordPayment,signBookingContract,reservePayment}=await import("./.combined-booking-bundle.mjs");
const shop="v0j63n-ms.myshopify.com",created=[],originalFetch=global.fetch;
const m=n=>({presentmentMoney:{amount:(n/100).toFixed(2),currencyCode:"USD"}});
let settingsCreated=false;
const conn=nodes=>({nodes,pageInfo:{hasNextPage:false}});
try{
 if(!await db.bookingSettings.findUnique({where:{shop}})){await db.bookingSettings.create({data:{shop,dailyCapacity:2,agreementText:"Test terms",prepaymentPercent:30,configJson:"{}"}});settingsCreated=true;}
 global.fetch=async url=>{assert.match(String(url),/^https:\/\/www.atelierelunora.com\/products\//);const handle=String(url).split("/").pop().replace(".js","");return Response.json({handle,published_at:"2026-10-22",tags:["booking add-on"],variants:[{id:67923044860192,title:"50 magnets",price:14900,available:true,requires_shipping:true}]});};
 // Give only the chosen product its real variant. Other products are not published in this fixture.
 const catalogueFetch=global.fetch;global.fetch=async url=>String(url).includes("/save-the-date-photo-magnets.js")?catalogueFetch(url):new Response(null,{status:404});
 const form={name:"Synthetic combined checkout",email:"test@example.invalid",venue:"Test venue",weddingDate:"2035-10-20",guests:50,addons:{},totalCents:149500,accepted:false,source:"customer",contractRequested:true,keepsakes:[{variantId:"67923044860192",quantity:1,unitCents:14900}]};
 const first=await createBooking(shop,form);created.push(first.booking.id);
 let booking=await db.weddingBooking.findUniqueOrThrow({where:{id:first.booking.id}}),d=details(booking);
 await test("selected keepsakes appear in the signed contract while wedding price stays separate",async()=>{
   assert.equal(booking.totalCents,149500);assert.equal(d.keepsakes.subtotalCents,14900);
   assert.equal(d.agreement.contract.document.prepaymentCents,44850);assert.equal(d.agreement.contract.document.balanceCents,104650);
   assert.equal(d.agreement.contract.document.keepsakes.items[0].variantName,"50 magnets");
   await assert.rejects(reservePayment(shop,booking.id,"prepayment"),/Sign/);
   await signBookingContract(shop,booking.id,new URLSearchParams({contractHash:d.agreement.contract.hash,signatureName:"Synthetic Signer",signatureConsent:"yes"}),first.portalToken);
 });
 let lastLines,payNumber=1000,createCalls=0;
 const admin={graphql:async(q,{variables})=>{
   assert.match(q,/draftOrderCreate/);createCalls++;
   const p=await db.bookingPayment.findFirstOrThrow({where:{id:variables.input.customAttributes.find(a=>a.key==="elunora_payment_id").value}});
   lastLines=variables.input.lineItems;
   const nodes=lastLines.map((l,i)=>({id:"line-"+i,quantity:l.quantity,requiresShipping:!!l.variantId,variant:l.variantId?{id:l.variantId}:null,customAttributes:l.customAttributes||[],originalUnitPriceSet:l.variantId?m(Number(l.priceOverride.amount)*100):m(p.amountCents)}));
   return Response.json({data:{draftOrderCreate:{draftOrder:{id:"gid://shopify/DraftOrder/"+(++payNumber),invoiceUrl:"https://example.invalid/checkout",lineItems:conn(nodes),totalDiscountsSet:m(0),totalPriceSet:m(p.amountCents+(nodes.length>1?14900:0))},userErrors:[]}}});
 }};
 let payment;
 await test("initial invoice contains full product variant plus only the service deposit and retry reuses it",async()=>{
   await invoice(admin,shop,booking.id,"prepayment");assert.equal(lastLines.length,2);assert.equal(lastLines[0].originalUnitPriceWithCurrency.amount,"448.50");assert.equal(lastLines[1].priceOverride.amount,"149.00");assert.equal(lastLines[1].quantity,1);
   assert.equal(lastLines[1].variantId,"gid://shopify/ProductVariant/67923044860192");
   await invoice(admin,shop,booking.id,"prepayment");assert.equal(createCalls,1);
   payment=await db.bookingPayment.findFirstOrThrow({where:{bookingId:booking.id}});
   assert.equal(payment.amountCents,44850);assert.equal(payment.expectedGrandTotalCents,59750);
 });
 await test("verified combined order and replay keep 70% service balance; next invoice cannot rebill the products",async()=>{
   const order={id:"gid://shopify/Order/1001",updatedAt:"2026-10-22T23:00:00Z",taxesIncluded:false,customAttributes:[{key:"elunora_booking_id",value:booking.id},{key:"elunora_payment_id",value:payment.id}],
     lineItems:conn([{id:"service",quantity:1,requiresShipping:false,variant:null,customAttributes:[{key:"_elunora_service_payment",value:payment.id}],originalUnitPriceSet:m(44850)},{id:"magnets",quantity:1,requiresShipping:true,variant:{id:"gid://shopify/ProductVariant/67923044860192"},originalUnitPriceSet:m(14900)}]),shippingLines:conn([{originalPriceSet:m(1000)}]),refunds:[],totalShippingPriceSet:m(1000),totalPriceSet:m(60750),totalTaxSet:m(0),currentTotalTaxSet:m(0),totalDiscountsSet:m(0),totalReceivedSet:m(60750),totalRefundedSet:m(0)};
   await db.bookingPayment.update({where:{id:payment.id},data:{orderId:order.id}});
   await recordPayment(shop,payment.id,order);await recordPayment(shop,payment.id,order);
   booking=await db.weddingBooking.findUniqueOrThrow({where:{id:booking.id}});d=details(booking);
   assert.equal(booking.paidCents,44850);assert.equal(booking.status,"confirmed");assert.equal(d.paymentStatus,"partially_paid");
   assert.equal(d.keepsakeReceipts[payment.id].creditCents,14900);
   await invoice(admin,shop,booking.id,"balance");assert.equal(lastLines.length,1);assert.equal(lastLines[0].originalUnitPriceWithCurrency.amount,"1046.50");
 });
 await test("bad or stale product selections cannot create a booking",async()=>{
   const before=await db.weddingBooking.count({where:{shop}});
   await assert.rejects(createBooking(shop,{...form,weddingDate:"2035-10-21",keepsakes:[{variantId:"67923044860192",unitCents:1,quantity:1}]}),/changed or is unavailable/);
   assert.equal(await db.weddingBooking.count({where:{shop}}),before);
 });
}finally{
 global.fetch=originalFetch;
 for(const model of ["bookingEvent","bookingPayment","bookingMail","bookingReminder"])if(db[model])await db[model].deleteMany({where:{bookingId:{in:created}}});
 await db.weddingBooking.deleteMany({where:{id:{in:created}}});
 if(settingsCreated)await db.bookingSettings.delete({where:{shop}});
 await db.$disconnect();await rm("tests/.combined-booking-bundle.mjs",{force:true});
}
