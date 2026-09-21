import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {guestOriginal} from '../supabase/functions/gallery-api/guest-original.mjs';
const reply=(body,status=200)=>Response.json(body,{status});
function clientFor(results){let i=0;return {from(table){assert.equal(table,'gallery_photos');const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){assert.deepEqual(filters,{event_id:'event',id:'photo',ready:true,hidden:false});return results[Math.min(i++,results.length-1)];}};}};}
let reads=0;
const storage=()=>({from(bucket){assert.equal(bucket,'gallery-originals');return {async download(key){reads++;assert.equal(key,'event/photo/original.jpg');return {data:new Blob(['original bytes'])};}};}});
const ok={data:{original_key:'event/photo/original.jpg'}};
let response=await guestOriginal(clientFor([ok]),'event','photo',reply,new Headers(),storage);
assert.equal(response.status,200);assert.equal(await response.text(),'original bytes');assert.equal(response.headers.get('cache-control'),'private, no-store');
for(const denied of [{data:null},{data:{original_key:'other/photo/original.jpg'}},{data:{original_key:'event/photo/../secret'}},{error:{message:'db error'}}]){
 const before=reads;response=await guestOriginal(clientFor([denied]),'event','photo',reply,new Headers(),storage);assert.ok([404,503].includes(response.status));assert.equal(reads,before);
}
response=await guestOriginal(clientFor([ok,{data:null}]),'event','photo',reply,new Headers(),storage);assert.equal(response.status,404);
response=await guestOriginal(clientFor([ok]),'event','photo',reply,new Headers(),()=>{throw Error('storage unavailable');});assert.equal(response.status,503);
const source=readFileSync(new URL('../theme/sections/atelier-client-gallery.liquid',import.meta.url),'utf8');
const script=source.split('{% javascript %}')[1].split('{% endjavascript %}')[0];new vm.Script(script);
const zipCode=script.slice(script.indexOf(' function zipPhotos('),script.indexOf(' async function prepareDownloadPart('));
const zip=vm.runInNewContext(zipCode+';zipPhotos',{Blob,Uint8Array,DataView,TextEncoder});
const blob=zip([{name:'../photo.jpg',bytes:new TextEncoder().encode('original one')},{name:'photo.jpg',bytes:new TextEncoder().encode('original two')},{name:'été.png',bytes:new Uint8Array([0,1,255])}]);
const zipPath='/tmp/gallery-download-test.zip';writeFileSync(zipPath,Buffer.from(await blob.arrayBuffer()));
execFileSync('python',['-c',`import zipfile\nz=zipfile.ZipFile('${zipPath}')\nassert z.testzip() is None\nassert z.read(z.namelist()[0]) == b'original one'\nassert z.read(z.namelist()[1]) == b'original two'\nassert z.read(z.namelist()[2]) == bytes([0,1,255])\nassert all('/' not in n for n in z.namelist())\nassert 'été' in z.namelist()[2]`]);
console.log('PASS: original access checks, revoked access, storage failures, script syntax and ZIP contents/CRC/Unicode');
