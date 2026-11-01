import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';

const result=await build({entryPoints:['app/inquiry-analytics.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
const module={exports:{}};
runInNewContext(result.outputFiles[0].text,{module,exports:module.exports});
const {createInquiryReporter}=module.exports;
const id='a'.repeat(64),shop='v0j63n-ms.myshopify.com',origin='https://www.atelierelunora.com';
test('reporter requires server success and a recognized storefront, deduplicates updates, and omits personal data',()=>{
  const report=createInquiryReporter(),messages=[],parent={postMessage:(...args)=>messages.push(args)};
  for(const response of [undefined,{error:'Save failed'},{saved:false,conversionId:id},{saved:true,conversionId:'invalid'}])report(response,shop,origin,parent);
  report({saved:true,conversionId:id},shop,'https://evil.example.com',parent);
  report({saved:true,conversionId:id},'other.myshopify.com',origin,parent);
  assert.equal(messages.length,0);
  const saved={saved:true,conversionId:id,savedToken:'private',email:'private@example.invalid'};
  report(saved,shop,origin,parent);report(saved,shop,origin,parent);
  assert.equal(JSON.stringify(messages),JSON.stringify([[{type:'elunora:inquiry-saved',conversionId:id},origin]]));
});
test('analytics errors cannot break a successful save; development traffic cannot target production',()=>{
  const report=createInquiryReporter();
  assert.doesNotThrow(()=>report({saved:true,conversionId:id},shop,origin,{postMessage(){throw Error('blocked')}}));
  let count=0;report({saved:true,conversionId:id},'atelier-elunora-gallery-test.myshopify.com',origin,{postMessage(){count++}});
  assert.equal(count,0);
});

const pixel=readFileSync(new URL('../pixels/meta-inquiries.js',import.meta.url),'utf8');
function sandbox({consent=true,storage=new Map(),bootstrap=false,blocked=false,storageBlocked=false}={}) {
  const callbacks={},calls=[],scripts=[];
  let change;
  const privacy={marketingAllowed:consent,analyticsProcessingAllowed:consent,saleOfDataAllowed:consent};
  const window=bootstrap?{}:{fbq:(...args)=>{if(blocked)throw Error('SDK blocked');calls.push(args)}};
  const context={window,document:{createElement:()=>({}),getElementsByTagName:()=>[{parentNode:{insertBefore:s=>scripts.push(s)}}]},init:{customerPrivacy:privacy},api:{customerPrivacy:{subscribe:(name,fn)=>{assert.equal(name,'visitorConsentCollected');change=fn}}},analytics:{subscribe:(name,fn)=>{callbacks[name]=fn}},browser:{sessionStorage:{getItem:async key=>{if(storageBlocked)throw Error('Storage blocked');return storage.get(key)},setItem:async(key,value)=>{if(storageBlocked)throw Error('Storage blocked');storage.set(key,value)}}}};
  runInNewContext(pixel,context);
  return {window,calls,scripts,callbacks,change,send:(data={conversion_id:id})=>callbacks['elunora:inquiry_saved']({customData:data})};
}
test('pixel sends one Lead across updates, concurrent replay, and sandbox reload, without duplicate pageviews or purchases',async()=>{
  const storage=new Map(),s=sandbox({storage});
  assert.deepEqual(Object.keys(s.callbacks),['elunora:inquiry_saved']);
  await Promise.all([s.send(),s.send()]);
  const leads=s.calls.filter(c=>c[0]==='track');assert.equal(leads.length,1);
  assert.equal(JSON.stringify(leads[0]),JSON.stringify(['track','Lead',{content_name:'Wedding inquiry'},{eventID:'elunora-lead-'+id}]));
  assert.ok(s.calls.some(c=>c[0]==='set'&&c[1]==='autoConfig'&&c[2]===false));
  const reload=sandbox({storage});await reload.send();assert.equal(reload.calls.length,0);
});
test('SDK bootstraps only for an allowed Lead; blocked SDK or session storage fails safely',async()=>{
  const fresh=sandbox({bootstrap:true});assert.equal(fresh.scripts.length,0);await fresh.send();
  assert.equal(fresh.scripts.length,1);assert.equal(fresh.scripts[0].src,'https://connect.facebook.net/en_US/fbevents.js');
  assert.equal(Array.from(fresh.window.fbq.queue).filter(args=>args[0]==='track'&&args[1]==='Lead').length,1);
  const unavailable=sandbox({blocked:true});await assert.doesNotReject(unavailable.send());assert.equal(unavailable.calls.length,0);
  const noStorage=sandbox({storageBlocked:true});await noStorage.send();await noStorage.send();assert.equal(noStorage.calls.filter(c=>c[0]==='track').length,1);
});
test('no SDK or event for missing consent or invalid identifier; later revocation is respected',async()=>{
  const s=sandbox({consent:false});await s.send();assert.equal(s.calls.length,0);assert.equal(s.scripts.length,0);
  s.change({customerPrivacy:{marketingAllowed:true,analyticsProcessingAllowed:true,saleOfDataAllowed:true}});
  await s.send({conversion_id:'invalid'});assert.equal(s.calls.length,0);
  await s.send();assert.equal(s.calls.filter(c=>c[0]==='track').length,1);
  s.change({customerPrivacy:{marketingAllowed:false,analyticsProcessingAllowed:true,saleOfDataAllowed:true}});
  await s.send({conversion_id:'b'.repeat(64)});
  assert.equal(s.calls.filter(c=>c[0]==='track').length,1);
  assert.equal(JSON.stringify(s.calls.at(-1)),JSON.stringify(['consent','revoke']));
});
