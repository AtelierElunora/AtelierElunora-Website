import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {previewText,safeMagnetPreview} from '../public/matching-card-preview.js';

await test('card wording preserves line breaks, falls back to entered names/date and stays bounded',()=>{
 assert.equal(previewText(' Alex & Jordan\r\nJuly 24, 2027 ','Other','Other'),'Alex & Jordan\nJuly 24, 2027');
 assert.equal(previewText(' ','Alex & Jordan','July 24, 2027'),'Alex & Jordan\nJuly 24, 2027');
 assert.equal(previewText(undefined,undefined,undefined),'');
 assert.equal(previewText('x'.repeat(1100),'','').length,1000);
 assert.equal(previewText('<img src=x onerror=alert(1)>','',''),'<img src=x onerror=alert(1)>');
});
await test('only bounded raster previews may load; external URLs and executable formats stay out',()=>{
 for(const value of ['https://example.com/tracker.jpg','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','blob:https://www.atelierelunora.com/abc',{},null,'data:image/jpeg;base64,'+'A'.repeat(800000)])assert.equal(safeMagnetPreview(value),'');
 for(const value of ['data:image/jpeg;base64,/9j/AA==','data:image/png;base64,iVBORw0KGgo='])assert.equal(safeMagnetPreview(value),value);
});
await test('booking and storefront use the identical preview renderer',async()=>{
 assert.equal(await readFile('public/matching-card-preview.js','utf8'),await readFile('tests/fixtures/storefront/atelier-matching-card-preview.js','utf8'));
});
await test('storefront accepts preview updates only from its exact designer window, origin and channel',async()=>{
 const callbacks={},registry=new Map(),attrs=new Map(),preview={setAttribute:(k,v)=>attrs.set(k,v)},fields={'[name="properties[Matching card wording]"]':{value:'Alex & Jordan\nCelebrate with us'},'[name="properties[Your names]"]':{value:'Alex & Jordan'}};
 class Element {};
 class Frame extends Element{contentWindow={};};class Form extends Element{addEventListener(){}};
 const frame=new Frame(),form=new Form();
 class Host extends Element{
  dataset={designerOrigin:'https://booking.example.invalid'};
  querySelector(s){return s==='[data-designer]'?frame:s==='form'?form:fields[s]||null;}
  querySelectorAll(s){return s==='[data-card-preview]'?[preview]:[];}
 }
 const context=vm.createContext({HTMLElement:Host,HTMLIFrameElement:Frame,HTMLFormElement:Form,AbortController,URL,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},location:{origin:'https://www.atelierelunora.com'},window:{addEventListener:(type,fn)=>callbacks[type]=fn},customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)}});
 vm.runInContext(await readFile('tests/fixtures/storefront/atelier-save-date-designer.js','utf8'),context);
 const host=new (registry.get('atelier-save-date'))();host.connectedCallback();
 const good={source:frame.contentWindow,origin:host.dataset.designerOrigin,data:{type:'elunora:save-date-preview',channel:host.channel,preview:{src:'data:image/jpeg;base64,/9j/AA==',date:'July 24, 2027'}}};
 for(const change of [{origin:'https://attacker.invalid'},{source:{}},{data:{...good.data,channel:'wrong'}},{data:{...good.data,preview:{src:'https://attacker.invalid/pixel',date:'test'}}}]){callbacks.message({...good,...change});assert.equal(attrs.get('magnet-src'),'');}
 callbacks.message(good);assert.equal(attrs.get('magnet-src'),good.data.preview.src);assert.equal(attrs.get('card-wording'),fields['[name="properties[Matching card wording]"]'].value);assert.equal(attrs.get('event-date'),'July 24, 2027');
 callbacks.message({...good,data:{...good.data,preview:null}});assert.equal(attrs.get('magnet-src'),'');assert.equal(attrs.get('card-wording'),fields['[name="properties[Matching card wording]"]'].value);
 fields['[data-couple-names]']=fields['[name="properties[Your names]"]'];fields['[name="properties[Matching card wording]"]'].value='Celebrate with us';
 callbacks.message(good);assert.equal(attrs.get('card-wording'),'Alex & Jordan\nJuly 24, 2027\nCelebrate with us');assert.equal(fields['[name="properties[Matching card wording]"]'].value,'Celebrate with us');
});
await test('prepared checkout artwork supplies the combined preview without a separate preview message and ignores stale loads',async()=>{
 const callbacks={},registry=new Map(),attrs=new Map(),images=[],revoked=[],elements={};
 for(const s of ['[data-original]','[data-print]','[data-top]','[data-bottom]','[data-ink]','[data-top-style]','[data-date-style]','[data-status]','[data-add]'])elements[s]={value:'',textContent:'',disabled:true};
 const result='data:image/jpeg;base64,/9j/AA==';
 class Frame{contentWindow={};};class Form{addEventListener(){}};
 const frame=new Frame(),form=new Form();
 class Host{
  dataset={designerOrigin:'https://booking.example.invalid',ready:'Ready',waiting:'Waiting',error:'Error'};
  querySelector(s){return s==='[data-designer]'?frame:s==='form'?form:s==='[data-unit-variant]'?{dataset:{available:'true'}}:elements[s]||null;}
  querySelectorAll(s){return s==='[data-card-preview]'?[{setAttribute:(k,v)=>attrs.set(k,v)}]:[];}
 }
 class TestURL extends URL{static createObjectURL(){return 'blob:test-'+images.length}static revokeObjectURL(url){revoked.push(url)}}
 class TestImage{constructor(){images.push(this)}}
 class Transfer{items={add:f=>this.files.push(f)};files=[];}
 const context=vm.createContext({HTMLElement:Host,HTMLIFrameElement:Frame,HTMLFormElement:Form,AbortController,URL:TestURL,Image:TestImage,File,ArrayBuffer,DataTransfer:Transfer,document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>result})},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},location:{origin:'https://www.atelierelunora.com'},window:{addEventListener:(type,fn)=>callbacks[type]=fn},customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)}});
 vm.runInContext(await readFile('tests/fixtures/storefront/atelier-save-date-designer.js','utf8'),context);
 const host=new (registry.get('atelier-save-date'))();host.connectedCallback();
 const event=ready=>({source:frame.contentWindow,origin:host.dataset.designerOrigin,data:{type:'elunora:save-date-ready',channel:host.channel,ready,design:{version:1,topEnabled:true,topText:'Save the date',bottomText:'July 24, 2027',ink:'white'},original:{bytes:new ArrayBuffer(5),type:'image/jpeg',name:'photo.jpg'},print:{bytes:new ArrayBuffer(5),type:'image/png'}}});
 callbacks.message(event(true));assert.equal(images.length,1);images[0].onload();assert.equal(attrs.get('magnet-src'),result);assert.equal(attrs.get('event-date'),'July 24, 2027');assert.equal(elements['[data-print]'].files[0].type,'image/png');assert.equal(elements['[data-status]'].textContent,'Ready');
 callbacks.message(event(true));const stale=images[1];callbacks.message(event(false));assert.equal(attrs.get('magnet-src'),'');stale.onload();assert.equal(attrs.get('magnet-src'),'');
 callbacks.message(event(true));const detached=images[2];host.disconnectedCallback();detached.onload();assert.equal(attrs.get('magnet-src'),'');assert.ok(revoked.length>=3);
 assert.match(frame.src,/previewVersion=20261027-lettering-colors/);
});
await build({stdin:{contents:"export {MatchingCardPreview} from './app/MatchingCardPreview';export {SaveDateDesigner} from './app/SaveDateDesigner';export {loader as designerLoader} from './app/routes/save-date-designer';",resolveDir:process.cwd(),loader:'ts'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:'tests/.card-preview.mjs'});
try{
 const {MatchingCardPreview,SaveDateDesigner,designerLoader}=await import('./.card-preview.mjs');
 await test('custom colors require a compatible storefront bridge; legacy themes retain accepted cream/olive metadata',()=>{
  const base='https://example.invalid/save-date-designer?parentOrigin=https%3A%2F%2Fwww.atelierelunora.com&channel=00000000-0000-4000-8000-000000000001';
  for(const version of ['', '&previewVersion=20261027-prepared-image','&previewVersion=unrecognized'])assert.equal(designerLoader({request:new Request(base+version)}).customColors,false);
  assert.equal(designerLoader({request:new Request(base+'&previewVersion=20261027-lettering-colors')}).customColors,true);
  const legacy=renderToStaticMarkup(React.createElement(SaveDateDesigner,{onChange:()=>{},customColors:false}));
  assert.doesNotMatch(legacy,/type="color"/);assert.match(legacy,/Cream/);assert.match(legacy,/Olive/);
  assert.match(renderToStaticMarkup(React.createElement(SaveDateDesigner,{onChange:()=>{}})),/type="color"/);
 });
 await test('review preview keeps wording literal and does not turn customer text into HTML',()=>{
  const html=renderToStaticMarkup(React.createElement(MatchingCardPreview,{wording:'Alex & Jordan\n<script>alert(1)</script>',view:'set',magnetSrc:'data:image/jpeg;base64,/9j/AA=='}));
  assert.match(html,/view="set"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/card-wording=/);
 });
}finally{await rm('tests/.card-preview.mjs',{force:true});}
