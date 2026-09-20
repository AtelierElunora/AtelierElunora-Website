import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const ownerRoot=fileURLToPath(new URL('../shopify-owner-app/',import.meta.url));
const {outputFiles}=await build({stdin:{contents:`import {h,render} from 'preact';
import {PhotoStation} from './extensions/gallery-owner/src/PhotoStation.jsx';
window.mountOwnerStation=props=>render(h(PhotoStation,props),document.body);
window.unmountOwnerStation=()=>render(null,document.body);`,resolveDir:ownerRoot,loader:'jsx'},bundle:true,format:'iife',write:false});
const w=new Window({url:'https://admin.shopify.com/'});w.eval(outputFiles[0].text);
const calls=[];const route='owner/station/11111111-1111-4111-8111-111111111111';
const props={event:{id:route.split('/')[2]},busy:false,run:fn=>fn(),call:async(path,body)=>{
 calls.push({path,body});assert.equal(path,route);
 if(body?.action==='template')return {template:body.template};
 if(body?.action==='create')return {id:'station-1',expiresAt:'2026-09-21T01:00:00Z',url:'https://www.atelierelunora.com/pages/photo-station#capture=test-only'};
 return {stations:[],jobs:[{id:'photo-12345678',status:'pending',created_at:'2026-09-20T01:00:00Z'}]};
}};
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}assert.ok(fn(),'owner panel did not settle');}
try{
 w.mountOwnerStation(props);await until(()=>w.document.body.textContent.includes('1 pending'));
 assert.equal(w.document.querySelector('s-section').getAttribute('heading'),'Photo station & live print queue');
 const button=[...w.document.querySelectorAll('s-button')].find(b=>b.textContent==='Create tablet capture link');assert.ok(button);button.click();
 await until(()=>w.document.querySelector('s-link'));
 assert.ok(calls.some(c=>c.body?.action==='create'&&c.body.purpose==='capture'));
 assert.match(w.document.querySelector('s-link').getAttribute('href'),/#capture=test-only$/);
 const save=[...w.document.querySelectorAll('s-button')].find(b=>b.textContent==='Save event template');assert.ok(save);save.click();await until(()=>calls.some(c=>c.body?.action==='template'));assert.equal(calls.find(c=>c.body?.action==='template').body.template.cutInches,3.25);
 console.log('PASS: owner Photo Station panel mounts using Preact, loads queue, and creates a capture link.');
}finally{w.unmountOwnerStation();w.happyDOM.abort();}
