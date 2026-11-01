import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

await build({ stdin: { contents: `export * from './app/wedding-keepsakes';export * from './app/matching-card';export {keepsakeContractRows} from './app/booking-contract';export * from './app/wedding-keepsakes.server';export { KeepsakeCard } from './app/WeddingKeepsakes';export { quote, defaultConfig, percentAmount } from './app/booking-rules';`, resolveDir: process.cwd(), loader:'ts' }, bundle:true, packages:'external', platform:'node', format:'esm', jsx:'automatic', outfile:'tests/.keepsakes-bundle.mjs' });
const { matchingCardWording, matchingCardAttributes, keepsakeContractRows, publishedKeepsake, loadWeddingKeepsakes, keepsakeProducts, keepsakeCheckoutUrl, productUrl, KeepsakeCard, quote, defaultConfig, percentAmount, resolveKeepsakeSelection, bookingBundlePrice, bookingKeepsakeItem } = await import('./.keepsakes-bundle.mjs');
const spec=keepsakeProducts[0];
const product=(s=spec)=>({handle:s.handle,published_at:'2026-10-22T00:00:00Z',tags:['booking add-on'],featured_image:'//cdn.shopify.com/s/files/test.jpg',variants:[{id:67923044827424,title:'25 magnets',price:8900,available:true,requires_shipping:true},{id:67923044860192,title:'50 magnets',price:14900,available:true,requires_shipping:true}]});
try {
await test('published products preserve every variant price and exact pack size',()=>{
  const p=publishedKeepsake(product(),spec);
  assert.deepEqual(p.variants.map(v=>[v.id,v.name,v.priceCents]),[['67923044827424','25 magnets',8900],['67923044860192','50 magnets',14900]]);
  assert.equal(p.image,'https://cdn.shopify.com/s/files/test.jpg');
  assert.equal(keepsakeCheckoutUrl(p.variants[1]),'https://www.atelierelunora.com/cart/67923044860192:1');
  assert.equal(productUrl(p,p.variants[1]),'https://www.atelierelunora.com/products/save-the-date-photo-magnets?variant=67923044860192');
});
await test('unpublished, unrelated, malformed and sold-out items cannot generate purchases',()=>{
  for(const change of [{published_at:null},{handle:'other'},{tags:[]},{requires_selling_plan:true},{variants:[{...product().variants[0],available:false}]}])assert.equal(publishedKeepsake({...product(),...change},spec),null);
  for(const change of [{price:-1},{price:1.5},{id:'javascript:bad'},{requires_shipping:false}])assert.equal(publishedKeepsake({...product(),variants:[{...product().variants[0],...change}]},spec),null);
  assert.equal(publishedKeepsake({...product(),featured_image:'https://evil.example/image.jpg'},spec).image,null);
  assert.throws(()=>keepsakeCheckoutUrl({id:'1?x=bad',available:true}));assert.throws(()=>keepsakeCheckoutUrl({id:'1',available:false}));
});
await test('catalogue reads only allowlisted published products; one failure does not break booking',async()=>{
  const calls=[];
  const fake=async(url,options)=>{calls.push([url,options]);const s=keepsakeProducts.find(s=>url.endsWith('/'+s.handle+'.js'));return Response.json(product(s));};
  assert.equal((await loadWeddingKeepsakes('v0j63n-ms.myshopify.com',fake)).products.length,4);
  assert.equal(calls.length,4);assert.ok(calls.every(([url,opts])=>url.startsWith('https://www.atelierelunora.com/products/')&&opts.redirect==='error'&&!opts.body&&!opts.credentials&&!opts.headers.Authorization));
  assert.deepEqual(await loadWeddingKeepsakes('atelier-elunora-gallery-test.myshopify.com',fake),{products:[],incomplete:false});assert.equal(calls.length,4);
  assert.equal((await loadWeddingKeepsakes('v0j63n-ms.myshopify.com',async url=>url.includes(spec.handle)?new Response(null,{status:404}):fake(url,{}))).products.length,3);
  const partial=await loadWeddingKeepsakes('v0j63n-ms.myshopify.com',async url=>url.includes(spec.handle)?new Response(null,{status:503}):fake(url,{}));assert.equal(partial.products.length,3);assert.equal(partial.incomplete,true);
  await assert.rejects(loadWeddingKeepsakes('v0j63n-ms.myshopify.com',async()=>{throw Error('offline')}),/temporarily unavailable/);
});
await test('cards browse before confirmation and open a separate product checkout after confirmation',()=>{
  const p=publishedKeepsake(product(),spec);
  const browse=renderToStaticMarkup(React.createElement(KeepsakeCard,{product:p,confirmed:false}));
  const buy=renderToStaticMarkup(React.createElement(KeepsakeCard,{product:p,confirmed:true}));
  assert.match(browse,/View product &amp; details/);assert.doesNotMatch(browse,/\/cart\//);assert.match(browse,/target="_blank"/);assert.match(browse,/noopener noreferrer/);
  assert.match(buy,/\/products\/save-the-date-photo-magnets/);assert.match(buy,/View product &amp; details/);assert.doesNotMatch(buy,/\/cart\//);assert.match(buy,/shipping at checkout/);
  assert.match(browse,/Available separately or with your wedding booking/);assert.equal(p.requiresBooking,false);assert.match(browse,/\$149\.00/);
  assert.doesNotMatch(browse,/(bookingToken|customerEmail|addon_)/);
});
await test('booking cards add in place and server resolves prices without accepting arbitrary variants',()=>{
 const p=publishedKeepsake(product(),spec);
 const view=renderToStaticMarkup(React.createElement(KeepsakeCard,{product:p,confirmed:false,onChange:()=>{}}));
 assert.match(view,/Add to my booking/);assert.doesNotMatch(view,/(target="_blank"|href=)/);
 const value=[{variantId:p.variants[1].id,unitCents:14900,quantity:1,name:"untrusted"}];
 const selected=resolveKeepsakeSelection(value,[p]);
 assert.equal(selected.subtotalCents,14900);assert.equal(selected.items[0].quantity,1);assert.equal(selected.items[0].name,spec.name);
 for(const v of [[{...value[0],unitCents:1}],[{...value[0],quantity:50}],[{...value[0],variantId:"other"}],[...value,...value],{}])assert.throws(()=>resolveKeepsakeSelection(v,[p]));
 assert.throws(()=>resolveKeepsakeSelection(value,[{...p,variants:p.variants.map(v=>({...v,available:false}))}]));
});
await test('15% bundles show regular price and savings for every eligible magnet set and frame',()=>{
 for(const spec of keepsakeProducts){
   const p=publishedKeepsake(product(spec),spec),variant=p.variants[0];
   const item=bookingKeepsakeItem(p,variant),selected=resolveKeepsakeSelection([item],[p],true);
   assert.equal(item.unitCents,7565);assert.equal(item.bundleDiscount.savingCents,1335);
   assert.equal(selected.subtotalCents,7565);
   const html=renderToStaticMarkup(React.createElement(KeepsakeCard,{product:p,confirmed:false,onChange:()=>{}}));
   assert.match(html,/Save 15%/);assert.match(html,/<del[^>]*>\$89\.00<\/del>/);assert.match(html,/\$75\.65/);
   const separate=renderToStaticMarkup(React.createElement(KeepsakeCard,{product:p,confirmed:true}));
   assert.doesNotMatch(separate,/Save 15%/);assert.match(separate,/\$89\.00/);
 }
 assert.equal(bookingBundlePrice(101).unitCents,86);
 assert.equal(bookingBundlePrice(10).bundleDiscount.savingCents,2);
 for(const price of [-1,1.5,Infinity,2147483648])assert.throws(()=>bookingBundlePrice(price));
});
await test('server calculates bundle prices, rejects forged discounts, and preserves legacy invoices',()=>{
 const p=publishedKeepsake(product(),spec),raw={variantId:p.variants[0].id,unitCents:8900,quantity:1};
 const bundled=resolveKeepsakeSelection([raw],[p],true),item=bundled.items[0];
 assert.equal(bundled.subtotalCents,7565);
 assert.equal(resolveKeepsakeSelection([raw],[p]).subtotalCents,8900);
 assert.equal(resolveKeepsakeSelection([item],[p]).subtotalCents,7565);
 for(const change of [{unitCents:1},{bundleDiscount:{...item.bundleDiscount,percent:99}},{bundleDiscount:{...item.bundleDiscount,originalUnitCents:1}},{bundleDiscount:{...item.bundleDiscount,savingCents:1}}])assert.throws(()=>resolveKeepsakeSelection([{...item,...change}],[p],true));
 assert.throws(()=>resolveKeepsakeSelection([item],[{...p,variants:p.variants.map(v=>({...v,priceCents:10000}))}],true));
});
await test('exact magnet quantities use all-unit tiers, the 25 minimum, and Shopify line discount rounding',()=>{
 const data=product();data.variants.push({id:999,title:'Custom quantity',sku:'AE-SAVE-DATE-EACH',price:300,available:true,requires_shipping:true});
 const p=publishedKeepsake(data,spec),v=p.variants.find(v=>v.bulk);
 for(const [quantity,unit,total] of [[25,300,6375],[49,300,12495],[50,250,10625],[73,250,15513],[99,250,21038],[100,225,19125],[101,225,19317],[249,225,47622],[250,200,42500],[251,200,42670],[1000,200,170000]]){
  const item=bookingKeepsakeItem(p,v,quantity),selection=resolveKeepsakeSelection([item],[p],true);
  assert.equal(item.quantity,quantity);assert.equal(item.unitCents,unit);assert.equal(selection.subtotalCents,total);
  assert.equal(item.bulkPricing.subtotalCents,quantity*unit);assert.equal(item.bulkPricing.savingCents,quantity*unit-total);
  assert.deepEqual(resolveKeepsakeSelection([item],[p]),selection);
 }
 for(const n of [0,1,24,25.5,'50',Infinity,7158279])assert.throws(()=>bookingKeepsakeItem(p,v,n));
 const item=bookingKeepsakeItem(p,v,73);
 for(const change of [{quantity:24},{quantity:100},{unitCents:200},{bulkPricing:{...item.bulkPricing,totalCents:1}},{bulkPricing:{...item.bulkPricing,savingCents:2738}},{bundleDiscount:{percent:15,originalUnitCents:300,savingCents:45}}])assert.throws(()=>resolveKeepsakeSelection([{...item,...change}],[p],true));
 const view=renderToStaticMarkup(React.createElement(KeepsakeCard,{product:p,confirmed:false,onChange:()=>{},item}));
 assert.match(view,/How many magnets/);assert.match(view,/min="25"/);assert.match(view,/value="73"/);assert.match(view,/\$155\.13/);assert.match(view,/Extra 15%/);assert.match(view,/Add 27 more/);
});
await test('matching card wording survives legacy packs and exact quantities without requiring magnet artwork',()=>{
 const data=product();data.variants.push({id:999,title:'Custom quantity',sku:'AE-SAVE-DATE-EACH',price:300,available:true,requires_shipping:true});
 const p=publishedKeepsake(data,spec),wording='Alex & Jordan\nJuly 24, 2027\nCelebrate with us';
 for(const v of p.variants){
  const raw={...bookingKeepsakeItem(p,v,v.bulk?73:1),cardWording:'  '+wording+'  '};
  const result=resolveKeepsakeSelection([raw],[p],true),i=result.items[0];
  assert.equal(i.cardWording,wording);assert.equal(i.personalization,undefined);
  assert.equal(result.subtotalCents,v.bulk?15513:bookingBundlePrice(v.priceCents).unitCents);
  assert.deepEqual(resolveKeepsakeSelection([i],[p]),result);
  assert.deepEqual(matchingCardAttributes(i.cardWording),[{key:'Matching card wording',value:wording}]);
  const rows=keepsakeContractRows({currency:'USD',prepaymentCents:44850,totalCents:149500,keepsakes:result});
  assert.equal(rows.find(([label])=>label.endsWith('matching card wording'))[1],wording);
 }
 const legacy=resolveKeepsakeSelection([{variantId:p.variants[0].id,unitCents:8900,quantity:1}],[p]);
 assert.equal(Object.hasOwn(legacy.items[0],'cardWording'),false);assert.deepEqual(matchingCardAttributes(undefined),[]);
 assert.equal(matchingCardWording(' A\r\nB\rC '),'A\nB\nC');assert.equal(matchingCardWording('   '),undefined);
 for(const value of [null,42,{},'x'.repeat(1001),'bad\u0000text'])assert.throws(()=>matchingCardWording(value),/1,000 characters/);
 assert.equal(matchingCardWording('x'.repeat(1000)).length,1000);
 const other=publishedKeepsake(product(keepsakeProducts[1]),keepsakeProducts[1]);
 assert.throws(()=>resolveKeepsakeSelection([{...bookingKeepsakeItem(other,other.variants[0]),cardWording:wording}],[other]),/only available/);
});
await test('custom card colors persist independently through prices, contracts and Shopify attributes',()=>{
 const data=product();data.variants.push({id:999,title:'Custom quantity',sku:'AE-SAVE-DATE-EACH',price:300,available:true,requires_shipping:true});
 const p=publishedKeepsake(data,spec);
 for(const v of p.variants){
  const item={...bookingKeepsakeItem(p,v,v.bulk?73:1),cardColor:'#7B428C'};
  const selection=resolveKeepsakeSelection([item],[p],true);
  assert.equal(selection.items[0].cardColor,'#7b428c');
  assert.equal(selection.subtotalCents,v.bulk?15513:bookingBundlePrice(v.priceCents).unitCents);
  assert.deepEqual(matchingCardAttributes(undefined,selection.items[0].cardColor),[{key:'Matching card lettering color',value:'#7B428C'}]);
  assert.equal(keepsakeContractRows({currency:'USD',prepaymentCents:44850,totalCents:149500,keepsakes:selection}).find(([key])=>key.endsWith('matching card lettering color'))[1],'#7B428C');
  for(const cardColor of [null,{},'red','#123','#123456;display:none'])assert.throws(()=>resolveKeepsakeSelection([{...item,cardColor}],[p],true));
 }
 const other=publishedKeepsake(product(keepsakeProducts[1]),keepsakeProducts[1]);
 assert.throws(()=>resolveKeepsakeSelection([{...bookingKeepsakeItem(other,other.variants[0]),cardColor:'#123456'}],[other]),/only available/);
});
await test('card controls have a separate label, retain literal wording, and escape markup',()=>{
 const p=publishedKeepsake(product(),spec),item={...bookingKeepsakeItem(p,p.variants[0]),cardWording:'Alex & Jordan\n<script>alert(1)</script>'};
 const html=renderToStaticMarkup(React.createElement(KeepsakeCard,{product:p,confirmed:false,onChange:()=>{},item}));
 assert.match(html,/Wording to print on your card \(optional\)/);assert.match(html,/maxLength="1000"/i);
 assert.match(html,/Alex &amp; Jordan/);assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/One matching card is included per magnet/);assert.match(html,/aria-describedby=/);
 const other=publishedKeepsake(product(keepsakeProducts[1]),keepsakeProducts[1]);
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(KeepsakeCard,{product:other,confirmed:false,onChange:()=>{}})),/Wording to print on your card/);
});
await test('physical products cannot enter event invoice totals; service extras retain 30% accounting',()=>{
  const config={...defaultConfig,packages:[{id:'base',name:'Wedding',priceCents:149500,maxGuests:150}],addons:[{id:'hour',name:'Additional hour',priceCents:25000}]};
  const base=quote(config,'base',100,{}),extra=quote(config,'base',100,{hour:1});
  assert.equal(base.totalCents,149500);assert.equal(percentAmount(base.totalCents,30),44850);
  assert.equal(extra.totalCents,174500);assert.equal(percentAmount(extra.totalCents,30),52350);
  assert.throws(()=>quote(config,'base',100,{'save-the-date-photo-magnets':1}));
});
} finally { await rm('tests/.keepsakes-bundle.mjs',{force:true}); }
