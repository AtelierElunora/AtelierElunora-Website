import assert from 'node:assert/strict';
import {stationRequest,hash} from '../supabase/functions/gallery-api/station.mjs';
import {cropRect,sheetLayout,letterCopyLayout,letterLayout,drawVerticalCutGuides} from '../theme/assets/atelier-station-core.js';
const reply=(body,status=200)=>({body,status});
assert.equal((await hash('test')).length,64);
assert.deepEqual(cropRect(1200,900,100,50),{sx:300,sy:0,size:900});
assert.deepEqual(cropRect(900,1200,50,0),{sx:0,sy:0,size:900});
assert.deepEqual(cropRect(1200,900,50,50,2),{sx:375,sy:225,size:450});
assert.deepEqual(cropRect(1200,900,100,100,3),{sx:900,sy:600,size:300});
for(const z of [0,0.9,3.1,NaN,Infinity])assert.throws(()=>cropRect(1200,900,50,50,z));
for(const qty of [1,2,3,12])for(const cut of [2.5,2.75,2.9,3.25,3.75]){
 const pages=sheetLayout(qty,cut);assert.equal(pages.flat().length,qty);for(const slot of pages.flat()){assert.ok(slot.x>=0&&slot.y>=0&&slot.x+slot.size<=1800&&slot.y+slot.size<=1200);}
}
assert.throws(()=>sheetLayout(13));assert.throws(()=>sheetLayout(2,4));assert.throws(()=>cropRect(1,1,Infinity,0));
const token='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';let calls=[];
const service={rpc:async(name)=>{calls.push(name);return {data:{event_id:id}};},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{name:'Test'}})})})})};
assert.equal((await stationRequest({token:'bad'},service,reply)).status,403);assert.equal(calls.length,0);
assert.equal((await stationRequest({token,purpose:'capture',action:'queue'},service,reply)).status,400);
assert.equal((await stationRequest({token,purpose:'print',action:'submit'},service,reply)).status,404);
assert.equal((await stationRequest({token,purpose:'capture',action:'submit',requestId:id,jpeg:'not an image'},service,reply)).status,400);
assert.equal((await stationRequest({token,purpose:'print',action:'update',id,version:1,operation:'claim',quantity:1,x:NaN},service,reply)).status,400);
assert.equal((await stationRequest({token,purpose:'print',action:'update',id,version:1,operation:'claim',zoom:4},service,reply)).status,400);
const denied={rpc:async()=>({error:{code:'PT403'}})};assert.equal((await stationRequest({token,purpose:'capture',action:'info'},denied,reply)).status,403);
console.log('PASS: capability validation, capture/print separation, input bounds and 300-PPI crop/sheet geometry.');
// Storage retry integration: first finalization fails after bytes are stored.
const stored=new Map();let ready=false,finalizations=0,rows=0;
const pipeline={
 from:service.from,
 rpc:async(name,args)=>{
  if(name==='gallery_station_check')return {data:{event_id:id}};
  if(name==='gallery_capture_reserve'){rows=1;return {data:{id,event_id:id,ready,original_key:'e/p/original.jpg',preview_key:'e/p/preview.jpg'}};}
  if(name==='gallery_capture_finish'){finalizations++;if(finalizations===1)return {error:{code:'PT503'}};ready=true;return {data:id};}
 },
 storage:{from:bucket=>({upload:async(key,bytes)=>{const path=bucket+'/'+key;if(stored.has(path))return {error:{statusCode:'400'}};stored.set(path,new Uint8Array(bytes));return {error:null};},download:async key=>({data:new Blob([stored.get(bucket+'/'+key)],{type:'image/jpeg'})})})}
};
const submission={token,purpose:'capture',action:'submit',requestId:id,jpeg:'/9j/AAAA'};
const render=async()=>new Uint8Array([255,216,255,0]);
assert.equal((await stationRequest(submission,pipeline,reply,render)).status,503);
assert.equal((await stationRequest(submission,pipeline,reply,render)).body.received,true);
assert.equal((await stationRequest(submission,pipeline,reply,render)).body.received,true);
assert.equal(stored.size,2);assert.equal(rows,1);assert.equal(finalizations,2);
console.log('PASS: original and preview reuse after failed finalization; successful receipt retries avoid duplicate storage or print finalization.');

for(const cut of [2.5,3.25,3.6]){const slots=letterLayout(Array(6).fill(cut));assert.equal(slots.length,6);for(const s of slots)assert.ok(s.x>=0&&s.y>=0&&s.x+s.size<=2550&&s.y+s.size<=3300);for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++){const a=slots[i],b=slots[j];assert.ok(a.x+a.size<=b.x||b.x+b.size<=a.x||a.y+a.size<=b.y||b.y+b.size<=a.y);}}
assert.equal(letterLayout(Array(6).fill(3.6))[0].y,30);assert.throws(()=>letterLayout([3.75]));assert.throws(()=>letterLayout([]));
for(const action of ['batch-status','batch-claim','batch-finish'])assert.equal((await stationRequest({token,purpose:'capture',action,requestId:id,id,partial:false,operation:'printed'},service,reply)).status,400);

for(const cuts of [Array(6).fill(3.6),[3.6,3.25,2.5,3.6,3.25,2.5],[3.6]]){
 const slots=letterLayout(cuts),marks=[];
 drawVerticalCutGuides({save(){},restore(){},fillRect(...r){marks.push(r);}},slots);
 assert.ok(marks.length>0);
 for(const [x,y,w,h] of marks){assert.ok(x>=0&&y>=0&&x+w<=2550&&y+h<=3300);assert.ok(!slots.some(s=>x<s.x+s.size&&x+w>s.x&&y<s.y+s.size&&y+h>s.y));}
 for(const s of slots)for(const edge of [s.x,s.x+s.size])assert.ok(marks.some(([x])=>x===edge||x+2===edge));
}
console.log('PASS: vertical cut guides align with full-cut edges and stay outside artwork on full, partial and mixed-size sheets.');

assert.deepEqual(letterCopyLayout(6,3.6).map(p=>p.length),[6]);assert.deepEqual(letterCopyLayout(6,3.75).map(p=>p.length),[4,2]);assert.deepEqual(letterCopyLayout(12,3.6).map(p=>p.length),[6,6]);
for(const cut of [2.5,3.25,3.6,3.75])for(const page of letterCopyLayout(12,cut))for(const s of page)assert.ok(s.x>=0&&s.y>=0&&s.x+s.size<=2550&&s.y+s.size<=3300);
