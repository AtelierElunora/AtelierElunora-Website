import assert from 'node:assert/strict';
import {activityFor,auditedOwnerAction} from '../supabase/functions/gallery-api/activity.mjs';
const event='00000000-0000-4000-8000-000000000002',reply=(b,s=200)=>Response.json(b,{status:s});
const activity={action:'event.permanent_delete',event_id:event};let n=0;const pass=s=>{n++;console.log('PASS '+s);};
async function scenario(response,{firstFail=false,lastFail=false,throws=false}={}){
 const records=[];let ran=false;let warning;
 const old=console.error;console.error=(...v)=>{warning=v;};
 const service={from(name){assert.equal(name,'gallery_activity_log');return {async insert(row){records.push(row);return {error:(records.length===1?firstFail:lastFail)?{message:'secret-provider-error'}:null};}}}};
 let result,error;
 try{result=await auditedOwnerAction({service,actor:'verified-owner',activity,reply,id:'operation-id',run:async()=>{ran=true;if(throws)throw Error('private token');return response;}});}catch(e){error=e;}finally{console.error=old;}
 return {records,ran,result,error,warning};
}
let r=await scenario(reply({deleted:true}));assert.deepEqual(r.records.map(x=>x.outcome),['started','succeeded']);assert.equal(r.records[0].actor_user_id,'verified-owner');pass('deletion attempt and success share actor and operation ID');
r=await scenario(reply({deleted:false}));assert.equal(r.records[1].outcome,'incomplete');pass('partial deletion is not recorded as success');
for(const [status,label] of [[400,'rejected'],[403,'rejected'],[409,'rejected'],[503,'failed']]){r=await scenario(reply({error:'private details'},status));assert.equal(r.records[1].outcome,label);assert.ok(!JSON.stringify(r.records).includes('private'));}pass('rejections/failures recorded without response body');
r=await scenario(reply({deleted:true}),{firstFail:true});assert.equal(r.ran,false);assert.equal(r.result.status,503);pass('audit outage blocks sensitive action before execution');
r=await scenario(null,{throws:true});assert.equal(r.records[1].outcome,'failed');assert.ok(!JSON.stringify(r.records).includes('private'));assert.ok(r.error);pass('thrown errors logged with safe reason and propagated');
r=await scenario(reply({deleted:true}),{lastFail:true});assert.equal(r.result.status,200);assert.deepEqual(r.warning,['Gallery activity outcome unavailable','operation-id']);pass('outcome outage preserves real action result and emits safe diagnostic');
for(const path of [['owner','events',event,'access'],['owner','events',event,'grants'],['owner','events',event,'remove-access'],['owner','events',event,'permanent-delete'],['owner','events',event],['owner','events']])assert.ok(activityFor({method:'POST'},path));pass('all requested sensitive owner routes covered');
for(const path of [['owner','events',event,'upload'],['events',event,'requests'],['owner','events','bad','access']])assert.equal(activityFor({method:'POST'},path),null);assert.equal(activityFor({method:'GET'},['owner','events',event]),null);pass('guest ordering, uploads, malformed paths and reads unchanged');
console.log(`${n} backend checks passed`);
