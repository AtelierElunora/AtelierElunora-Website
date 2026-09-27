import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:`export {ownerRoutes} from './supabase/functions/gallery-api/gallery.mts';export {storefrontHandler} from './supabase/functions/gallery-api/handler.mts';export {runtime} from './supabase/functions/gallery-api/runtime.mts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'offline',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth',namespace:'offline'}));b.onResolve({filter:/server-preview\.mts$/},()=>({path:'image',namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},a=>({contents:a.path==='auth'?`export function createClient(){throw Error('No live access');}`:`export function makeServerPreview(){throw Error('No images');}`}));}}]});
const {ownerRoutes,storefrontHandler,runtime}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
let state,writes,sends;const event='11111111-1111-4111-8111-111111111111';
function reset(overrides={}){state={owner:true,active:true,saveError:null,...overrides};writes=[];sends=[];}
const client={from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='gallery_admins'?(state.owner?{user_id:'owner'}:null):{id:event,active:state.active,deleted_at:state.deleted}}),upsert:async value=>{writes.push(value);return {error:state.saveError};}};}};
const reply=(body,status=200)=>Response.json(body,{status});
const send=async(id,email,resend)=>{sends.push({id,email,resend});return state.emailResult||{status:'accepted',message:'Invitation email accepted for sending.'};};
async function route(body,path='access'){const r=await ownerRoutes(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),['owner','events',event,path],client,reply,new Headers(),send);return {status:r.status,body:await r.json()};}
const body={email:' Couple@Example.Test ',expiresAt:'2099-12-01T23:59:59Z',revoked:false,sendEmail:true};
reset();let r=await route(body);assert.equal(r.status,200);assert.equal(r.body.saved,true);assert.equal(r.body.email.status,'accepted');assert.deepEqual(sends,[{id:event,email:'couple@example.test',resend:false}]);assert.equal(writes[0].email,'couple@example.test');
reset({emailResult:{status:'uncertain',message:'Access is saved; retry email.'}});r=await route(body);assert.equal(r.body.saved,true);assert.equal(r.body.email.status,'uncertain');assert.equal(writes.length,1);
for(const overrides of [{owner:false},{active:false},{deleted:'2026-01-01'},{saveError:{}}]){reset(overrides);r=await route(body);assert.ok(r.status>=400);assert.equal(sends.length,0);}
reset();r=await route({...body,sendEmail:false});assert.equal(r.body.saved,true);assert.equal(sends.length,0);
reset();r=await route({...body,revoked:true});assert.equal(r.status,409);assert.equal(sends.length,0);
reset();r=await route({...body,expiresAt:'2020-01-01'});assert.equal(r.status,409);assert.equal(sends.length,0);
reset();await route({email:body.email},'invitation-email');assert.equal(sends[0].resend,true);assert.equal(writes.length,0);
// Test the real HTTP guard: no service key lookup / sending for guests or AAL1 owners.
runtime.url='https://test.invalid';runtime.key='public-test';globalThis.Deno={env:{get:()=>undefined}};
for(const owner of [false,true]){reset({owner});const factory=()=>({...client,auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({data:true})});for(const path of ['access','invitation-email']){const r=await storefrontHandler(new Request('https://test.invalid/gallery-api/owner/events/'+event+'/'+path,{method:'POST',headers:{Origin:'https://www.atelierelunora.com','X-Elunora-Request':'1',Authorization:'Bearer untrusted-aal1'},body:'{}'}),factory);assert.equal(r.status,403);assert.equal(writes.length,0);assert.equal(sends.length,0);}}
console.log('PASS: save then automatic email, explicit save-only, saved access on delivery failure, invalid/paused/revoked access blocked, resend eligibility and real HTTP owner-MFA gates.');
