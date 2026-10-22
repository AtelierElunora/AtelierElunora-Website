import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

await build({ stdin: { contents: `export * from './app/wedding-keepsakes';export * from './app/wedding-keepsakes.server';export { KeepsakeCard } from './app/WeddingKeepsakes';export { quote, defaultConfig, percentAmount } from './app/booking-rules';`, resolveDir: process.cwd(), loader:'ts' }, bundle:true, packages:'external', platform:'node', format:'esm', jsx:'automatic', outfile:'tests/.keepsakes-bundle.mjs' });
const { publishedKeepsake, loadWeddingKeepsakes, keepsakeProducts, keepsakeCheckoutUrl, productUrl, KeepsakeCard, quote, defaultConfig, percentAmount } = await import('./.keepsakes-bundle.mjs');
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
  assert.match(buy,/\/cart\/67923044827424:1/);assert.match(buy,/Buy separately in Shopify/);assert.match(buy,/shipping at checkout/);
  assert.match(browse,/For confirmed wedding bookings/);assert.match(browse,/\$149\.00/);
  assert.doesNotMatch(browse,/(bookingToken|customerEmail|addon_)/);
});
await test('physical products cannot enter event invoice totals; service extras retain 30% accounting',()=>{
  const config={...defaultConfig,packages:[{id:'base',name:'Wedding',priceCents:149500,maxGuests:150}],addons:[{id:'hour',name:'Additional hour',priceCents:25000}]};
  const base=quote(config,'base',100,{}),extra=quote(config,'base',100,{hour:1});
  assert.equal(base.totalCents,149500);assert.equal(percentAmount(base.totalCents,30),44850);
  assert.equal(extra.totalCents,174500);assert.equal(percentAmount(extra.totalCents,30),52350);
  assert.throws(()=>quote(config,'base',100,{'save-the-date-photo-magnets':1}));
});
} finally { await rm('tests/.keepsakes-bundle.mjs',{force:true}); }
