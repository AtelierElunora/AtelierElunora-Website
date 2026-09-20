import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const ownerRoot=fileURLToPath(new URL('../shopify-owner-app/',import.meta.url));
const {outputFiles}=await build({stdin:{contents:`import {h,render} from 'preact';
import {PhotoStation} from './extensions/gallery-owner/src/PhotoStation.jsx';
window.mountOwnerStation=props=>render(h(PhotoStation,props),document.body);
window.unmountOwnerStation=()=>render(null,document.body);`,resolveDir:ownerRoot,loader:'jsx'},bundle:true,format:'iife',write:false});
const w=new Window({url:'https://admin.shopify.com/'});
class TextField extends w.HTMLElement{get value(){return this.getAttribute('value')??'';}set value(v){this.setAttribute('value',String(v));}}
w.customElements.define('s-text-field',TextField);
const scheduled=[];const originalTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>ms===5000?(scheduled.push(fn),999):originalTimeout(fn,ms,...args);
w.eval(outputFiles[0].text);
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
 const field=label=>[...w.document.querySelectorAll('s-text-field')].find(e=>e.getAttribute('label')===label);
 async function type(label,value){const el=field(label);assert.ok(el,label);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,30));}
 await type('Couple names','Breanna & Alex');
 await type('Event date text','6/20/2027');
 await type('Text distance from cut edge in inches (0.06–0.25)','0.');
 assert.equal(field('Text distance from cut edge in inches (0.06–0.25)').value,'0.');
 await type('Text distance from cut edge in inches (0.06–0.25)','0.12');
 await type('Position adjustment in inches (−0.04 to 0.04)','-');
 assert.equal(field('Position adjustment in inches (−0.04 to 0.04)').value,'-');
 await type('Position adjustment in inches (−0.04 to 0.04)','-0.01');
 assert.ok(scheduled.length);await scheduled.shift()();await new Promise(r=>setTimeout(r,30));
 assert.equal(field('Couple names').value,'Breanna & Alex');assert.equal(field('Event date text').value,'6/20/2027');
 const save=[...w.document.querySelectorAll('s-button')].find(b=>b.textContent==='Save event template');assert.ok(save);save.click();await until(()=>calls.some(c=>c.body?.action==='template'));const saved=calls.find(c=>c.body?.action==='template').body.template;assert.equal(saved.cutInches,3.25);assert.equal(saved.couple,'Breanna & Alex');assert.equal(saved.date,'6/20/2027');assert.equal(saved.edgeInset,0.12);assert.equal(saved.sides.top.offset,-0.01);
 console.log('PASS: owner Photo Station panel mounts using Preact, loads queue, creates a capture link, retains typing across queue polling, and saves decimal/negative inputs without blur.');
}finally{w.unmountOwnerStation();w.happyDOM.abort();}
