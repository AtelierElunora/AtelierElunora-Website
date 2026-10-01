// Run against a downloaded gallery-api experience.mjs with its station.mjs dependency:
// node event-security-contract.mjs /absolute/path/experience.mjs
// Mock contract test: no writes to live Supabase or customer data.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const { experienceRequest } = await import(pathToFileURL(process.argv[2]));
const digest = token => createHash('sha256').update(token).digest('hex');
const a = 'a'.repeat(64), b = 'b'.repeat(64);
const records = [
  {id:'a1',filename:'a.jpg',preview_key:'a1',event_id:'event',ready:true,gallery_guest_uploads:[{session_id:'A',status:'approved'}]},
  {id:'a2',filename:'pending.jpg',preview_key:'a2',event_id:'event',ready:true,gallery_guest_uploads:[{session_id:'A',status:'pending'}]},
  {id:'a3',filename:'rejected.jpg',preview_key:'a3',event_id:'event',ready:true,gallery_guest_uploads:[{session_id:'A',status:'rejected'}]},
  {id:'b1',filename:'b.jpg',preview_key:'b1',event_id:'event',ready:true,gallery_guest_uploads:[{session_id:'B',status:'approved'}]},
  {id:'private',filename:'host.jpg',preview_key:'host',event_id:'event',ready:true,gallery_guest_uploads:[]},
];
let revoked = false;
let signed = [];
let grantAttempted = false;
const service = {
  async rpc(name, args) {
    assert.equal(name,'gallery_experience_check');
    const id = args.p_token === digest(a) ? 'A' : args.p_token === digest(b) ? 'B' : null;
    return !id || revoked ? {error:{code:'PT403'}} : {data:{id,event_id:'event'}};
  },
  from(table) {
    if(table === 'gallery_access') { grantAttempted = true; throw Error('No gallery grants allowed'); }
    const filters=[];
    return {
      select(fields) { if(table==='gallery_photos') assert.ok(fields.includes('gallery_guest_uploads!inner')); return this; },
      eq(key, value) { filters.push([key,value]); return this; },
      in(key, values) { filters.push([key,values]); return this; },
      order() { return this; },
      async single() { assert.equal(table,'gallery_experiences'); return {data:{studio_user:null,upload_later:false,downloads:false}}; },
      async range(start,end) {
        assert.equal(table,'gallery_photos');
        assert.ok(filters.some(([k])=>k==='gallery_guest_uploads.session_id'));
        return {data:records.filter(r=>filters.every(([k,v])=> {
          if(k.startsWith('gallery_guest_uploads.')) return r.gallery_guest_uploads.some(u=>Array.isArray(v)?v.includes(u[k.split('.')[1]]):u[k.split('.')[1]]===v);
          return r[k]===v;
        })).slice(start,end+1)};
      }
    };
  },
  storage: {from(bucket) { assert.equal(bucket,'gallery-previews'); return {
    async createSignedUrls(keys,ttl) { assert.equal(ttl,300); signed.push(...keys); return {data:keys.map(path=>({path,signedUrl:'https://example.invalid/'+path}))}; }
  }; }}
};
const run = body => experienceRequest(body,service,(body,status=200)=>({body,status}),()=>{throw Error('unexpected rendering');});
const first = await run({action:'photos',session:a});
assert.equal(first.status,200); assert.deepEqual(first.body.photos.map(p=>p.id),['a1','a2']);
assert.deepEqual(signed,['a1','a2']); signed=[];
const second = await run({action:'photos',session:b});
assert.deepEqual(second.body.photos.map(p=>p.id),['b1']); assert.deepEqual(signed,['b1']);
assert.equal((await run({action:'claim',session:a})).status,403); assert.equal(grantAttempted,false);
assert.equal((await run({action:'photos',session:'bad'})).status,403);
assert.equal((await run({action:'photos',session:'c'.repeat(64)})).status,403);
assert.equal((await run({action:'photos',session:a,cursor:-1})).status,400);
assert.equal((await run({action:'downloads',session:a,ids:['b1']})).status,403);
revoked=true; signed=[];
assert.equal((await run({action:'photos',session:a})).status,403); assert.deepEqual(signed,[]);
console.log('PASS: own uploads only for two guests; pending/approved only; own previews only; no whole-gallery claim; malformed/unknown/revoked sessions denied; invalid cursor denied; downloads setting enforced.');
