import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {rm,readFile} from "node:fs/promises";
if(process.env.ELUNORA_DATABASE_BACKEND)throw Error("Only disposable SQLite is allowed.");
await build({entryPoints:["tests/server-entry.ts"],bundle:true,format:"esm",platform:"node",packages:"external",outfile:"tests/.bulk-booking-bundle.mjs"});
const {db,createBooking,details,invoice,recordPayment,signBookingContract,reservePayment,saveDateArtworkLoader,saveDateArtworkAttributes}=await import("./.bulk-booking-bundle.mjs");
const shop="v0j63n-ms.myshopify.com",created=[],originalFetch=global.fetch;
const m=n=>({presentmentMoney:{amount:(n/100).toFixed(2),currencyCode:"USD"}});
let settingsCreated=false;
const conn=nodes=>({nodes,pageInfo:{hasNextPage:false}});
try{
 if(!await db.bookingSettings.findUnique({where:{shop}})){await db.bookingSettings.create({data:{shop,dailyCapacity:2,agreementText:"Test terms",prepaymentPercent:30,configJson:"{}"}});settingsCreated=true;}
 global.fetch=async url=>{assert.match(String(url),/^https:\/\/www.atelierelunora.com\/products\//);const handle=String(url).split("/").pop().replace(".js","");return Response.json({handle,published_at:"2026-10-22",tags:["booking add-on"],variants:[{id:67923044860192,title:"Custom quantity",sku:"AE-SAVE-DATE-EACH",price:300,available:true,requires_shipping:true}]});};
 // Give only the chosen product its real variant. Other products are not published in this fixture.
 const catalogueFetch=global.fetch;global.fetch=async url=>String(url).includes("/save-the-date-photo-magnets.js")?catalogueFetch(url):new Response(null,{status:404});
 const personalized={version:1,typography:{topFont:"script",bottomFont:"modern",topSize:20,bottomSize:12},topEnabled:false,topText:"Save the date",bottomText:"October 20, 2035",ink:"#7b428c",photoDataUrl:"data:image/jpeg;base64,"+(await readFile(new URL("./save-date-fixture.jpg",import.meta.url))).toString("base64")};
 const form={name:"Synthetic combined checkout",email:"test@example.invalid",venue:"Test venue",weddingDate:"2035-10-20",guests:50,addons:{},totalCents:149500,accepted:false,source:"customer",contractRequested:true,keepsakes:[{variantId:"67923044860192",quantity:73,unitCents:250,bulkPricing:{version:1,unitCents:250,subtotalCents:18250,savingCents:2737,totalCents:15513,bundlePercent:15},personalization:personalized,cardColor:"#28394d",cardWording:"Alex & Jordan\nOctober 20, 2035\nCelebrate with us"}]};
 const first=await createBooking(shop,form);created.push(first.booking.id);
 let booking=await db.weddingBooking.findUniqueOrThrow({where:{id:first.booking.id}}),d=details(booking);
 await test("selected keepsakes appear in the signed contract while wedding price stays separate",async()=>{
   assert.equal(booking.totalCents,149500);assert.equal(d.keepsakes.subtotalCents,15513);assert.equal(d.keepsakes.items[0].bulkPricing.savingCents,2737);
   assert.equal(d.agreement.contract.document.prepaymentCents,44850);assert.equal(d.agreement.contract.document.balanceCents,104650);
   assert.equal(d.agreement.contract.document.keepsakes.items[0].variantName,"73 magnets");
   assert.equal(d.keepsakes.items[0].personalization.topEnabled,false);
   assert.equal(d.keepsakes.items[0].cardColor,"#28394d");
   assert.equal(d.agreement.contract.document.keepsakes.items[0].cardColor,"#28394d");
   assert.equal(d.keepsakes.items[0].cardWording,form.keepsakes[0].cardWording);
   assert.equal(d.agreement.contract.document.keepsakes.items[0].cardWording,form.keepsakes[0].cardWording);
   assert.equal(d.agreement.contract.document.keepsakes.items[0].personalization.typography.bottomFont,"modern");
   assert.doesNotMatch(JSON.stringify(d.agreement.contract.document),/data:image/);
   await assert.rejects(reservePayment(shop,booking.id,"prepayment"),/Sign/);
   await signBookingContract(shop,booking.id,new URLSearchParams({contractHash:d.agreement.contract.hash,signatureName:"Synthetic Signer",signatureConsent:"yes"}),first.portalToken);
 });
 let lastLines,payNumber=1000,createCalls=0;
 const admin={graphql:async(q,{variables})=>{
   assert.match(q,/draftOrderCreate/);createCalls++;
   const p=await db.bookingPayment.findFirstOrThrow({where:{id:variables.input.customAttributes.find(a=>a.key==="elunora_payment_id").value}});
   lastLines=variables.input.lineItems;
   const nodes=lastLines.map((l,i)=>({id:"line-"+i,quantity:l.quantity,requiresShipping:!!l.variantId,variant:l.variantId?{id:l.variantId}:null,customAttributes:l.customAttributes||[],appliedDiscount:l.appliedDiscount?{amountSet:m(Math.floor(Number(l.priceOverride.amount)*100*l.quantity*l.appliedDiscount.value/100))}:null,originalUnitPriceSet:l.variantId?m(Number(l.priceOverride.amount)*100):m(p.amountCents)}));
   return Response.json({data:{draftOrderCreate:{draftOrder:{id:"gid://shopify/DraftOrder/"+(++payNumber),invoiceUrl:"https://example.invalid/checkout",lineItems:conn(nodes),totalDiscountsSet:m(lastLines.reduce((n,l)=>n+(l.appliedDiscount?Math.floor(Number(l.priceOverride.amount)*100*l.quantity*l.appliedDiscount.value/100):0),0)),totalPriceSet:m(p.amountCents+(nodes.length>1?15513:0))},userErrors:[]}}});
 }};
 let payment;
 await test("initial invoice contains full product variant plus only the service deposit and retry reuses it",async()=>{
   await invoice(admin,shop,booking.id,"prepayment");assert.equal(lastLines.length,2);assert.equal(lastLines[0].originalUnitPriceWithCurrency.amount,"448.50");assert.equal(lastLines[1].priceOverride.amount,"2.50");assert.equal(lastLines[1].quantity,73);assert.equal(lastLines[1].appliedDiscount.value,15);assert.equal(lastLines[1].appliedDiscount.title,"Booking bundle · Save 15%");
   assert.equal(lastLines[1].customAttributes.find(a=>a.key==="Matching card wording").value,form.keepsakes[0].cardWording);
   assert.equal(lastLines[1].customAttributes.find(a=>a.key==="Matching card lettering color").value,"#28394D");
   assert.equal(lastLines[1].customAttributes.find(a=>a.key==="Lettering").value,"#7B428C");
   assert.equal(lastLines[1].variantId,"gid://shopify/ProductVariant/67923044860192");
   assert.equal(lastLines[1].customAttributes.find(a=>a.key==="Top wording").value,"Off — date only");
   assert.equal(lastLines[1].customAttributes.find(a=>a.key==="Date lettering").value,"Atelier Modern, 12 pt");
   assert.equal(lastLines[1].customAttributes.find(a=>a.key==="Bottom date").value,"October 20, 2035");
   assert.match(lastLines[1].customAttributes.find(a=>a.key==="Save-the-date design").value,/save-date-artwork/);
   await invoice(admin,shop,booking.id,"prepayment");assert.equal(createCalls,1);
   payment=await db.bookingPayment.findFirstOrThrow({where:{bookingId:booking.id}});
   assert.equal(payment.amountCents,44850);assert.equal(payment.expectedGrandTotalCents,60363);
 });
 await test("verified combined order and replay keep 70% service balance; next invoice cannot rebill the products",async()=>{
   const order={id:"gid://shopify/Order/1001",updatedAt:"2026-10-22T23:00:00Z",taxesIncluded:false,customAttributes:[{key:"elunora_booking_id",value:booking.id},{key:"elunora_payment_id",value:payment.id}],
     lineItems:conn([{id:"service",quantity:1,requiresShipping:false,variant:null,customAttributes:[{key:"_elunora_service_payment",value:payment.id}],originalUnitPriceSet:m(44850)},{id:"magnets",quantity:73,requiresShipping:true,customAttributes:lastLines[1].customAttributes,variant:{id:"gid://shopify/ProductVariant/67923044860192"},discountAllocations:[{allocatedAmountSet:m(2737)}],originalUnitPriceSet:m(250)}]),shippingLines:conn([{originalPriceSet:m(1000)}]),refunds:[],totalShippingPriceSet:m(1000),totalPriceSet:m(61363),totalTaxSet:m(0),currentTotalTaxSet:m(0),totalDiscountsSet:m(2737),totalReceivedSet:m(61363),totalRefundedSet:m(0)};
   await db.bookingPayment.update({where:{id:payment.id},data:{orderId:order.id}});
   await recordPayment(shop,payment.id,order);await recordPayment(shop,payment.id,order);
   booking=await db.weddingBooking.findUniqueOrThrow({where:{id:booking.id}});d=details(booking);
   assert.equal(booking.paidCents,44850);assert.equal(booking.status,"confirmed");assert.equal(d.paymentStatus,"partially_paid");
   assert.equal(d.keepsakeReceipts[payment.id].creditCents,15513);
   await invoice(admin,shop,booking.id,"balance");assert.equal(lastLines.length,1);assert.equal(lastLines[0].originalUnitPriceWithCurrency.amount,"1046.50");
 });
 await test("saved artwork downloads require the signed link and preserve the invoice snapshot",async()=>{
   // The deposit snapshot remains authoritative after the current selection changes.
   const saved=details(await db.weddingBooking.findUniqueOrThrow({where:{id:booking.id}}));
   const plan=saved.keepsakePayments[payment.id];
   assert.ok(plan.items[0].personalization);
   assert.equal(plan.items[0].cardWording,form.keepsakes[0].cardWording);
   await db.weddingBooking.update({where:{id:booking.id},data:{detailsJson:JSON.stringify({...saved,keepsakes:undefined})}});
   const attrs=saveDateArtworkAttributes(booking,plan.items[0].personalization);
   for(const [key,type] of [["Save-the-date design","image/svg+xml; charset=utf-8"],["Cropped photograph","image/jpeg"]]){
     const url=attrs.find(a=>a.key===key).value;
     const response=await saveDateArtworkLoader({request:new Request(url),params:{id:booking.id}});
     assert.equal(response.status,200);assert.equal(response.headers.get("Content-Type"),type);
     assert.equal(response.headers.get("Cache-Control"),"private, no-store");
     const bytes=new Uint8Array(await response.arrayBuffer());
     if(key==="Save-the-date design")assert.match(new TextDecoder().decode(bytes),/October 20, 2035/);
     else assert.deepEqual([...bytes.slice(0,2)],[255,216]);
     const bad=new URL(url);bad.searchParams.set("signature","0".repeat(64));
     assert.equal((await saveDateArtworkLoader({request:new Request(bad),params:{id:booking.id}})).status,404);
   }
   assert.equal((await saveDateArtworkLoader({request:new Request("https://example.invalid/save-date-artwork/unknown"),params:{id:"unknown"}})).status,404);
 });
 await test("bad or stale product selections cannot create a booking",async()=>{
   const before=await db.weddingBooking.count({where:{shop}});
   await assert.rejects(createBooking(shop,{...form,weddingDate:"2035-10-21",keepsakes:[{variantId:"67923044860192",unitCents:1,quantity:1}]}),/at least 25 magnets/);
   assert.equal(await db.weddingBooking.count({where:{shop}}),before);
 });
}finally{
 global.fetch=originalFetch;
 for(const model of ["bookingEvent","bookingPayment","bookingMail","bookingReminder"])if(db[model])await db[model].deleteMany({where:{bookingId:{in:created}}});
 await db.weddingBooking.deleteMany({where:{id:{in:created}}});
 if(settingsCreated)await db.bookingSettings.delete({where:{shop}});
 await db.$disconnect();await rm("tests/.bulk-booking-bundle.mjs",{force:true});
}
