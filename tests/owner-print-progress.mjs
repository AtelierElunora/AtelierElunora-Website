import assert from 'node:assert/strict';
import {ownerStation} from '../supabase/functions/gallery-api/station.mjs';
const eventId='11111111-1111-4111-8111-111111111111';
const totals={pending:125,printing:6,held:2,printed:240};
let denied=false,failed=false;
const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:denied?null:{id:eventId}})})})})};
const queries=[];
const service={from(table){
 assert.equal(denied,false,'must authorize event before service queries');
 const filters={};let options;
 const q={select(_columns,opts){options=opts;return q;},eq(k,v){filters[k]=v;return q;},neq(){return q;},gt(){return q;},order(){return q;},limit(n){assert.equal(n,100);return q;},maybeSingle(){return q;},then(resolve,reject){
  assert.equal(filters.event_id,eventId);
  let result={data:table==='gallery_magnet_templates'?null:[]};
  if(options?.count){assert.deepEqual(options,{count:'exact',head:true});queries.push(filters.status);result={count:totals[filters.status],error:failed?{message:'failed'}:null};}
  return Promise.resolve(result).then(resolve,reject);
 }};return q;
}};
const run=()=>ownerStation({method:'GET'},['owner','station',eventId],client,service,'owner',{},(body,status=200)=>({body,status}));
let r=await run();assert.equal(r.status,200);assert.deepEqual(r.body.counts,totals);assert.deepEqual(queries,['pending','printing','held','printed']);
failed=true;r=await run();assert.equal(r.status,503);assert.equal(r.body.counts,undefined);
denied=true;r=await run();assert.equal(r.status,404);
console.log('PASS: event-scoped exact print counts exceed queue limits; errors and inaccessible events do not expose misleading totals.');
