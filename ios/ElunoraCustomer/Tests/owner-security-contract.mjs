// Mock contract checks against downloaded live gallery-api files, no live writes.
// node owner-security-contract.mjs /path/to/handler.mts /path/to/owner-mfa.mts /path/to/typescript/lib/typescript.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require(process.argv[4]);
const transpile = path => ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleURL = code => 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const mfa = await import(moduleURL(transpile(process.argv[3])));
let owner=false, required=true, active=true, authenticated=true, stationCalls=0;
let currentUser={id:'owner-id',email:'owner@example.invalid',factors:[],user_metadata:{owner:true}};
const client={
  auth:{getUser: async ()=>authenticated?{data:{user:currentUser},error:null}:{data:{user:null},error:{}}},
  rpc:async name=>{assert.equal(name,'gallery_session_active');return {data:active,error:null}},
  from(table){assert.equal(table,'gallery_admins');return {select(){return this},eq(){return this},async maybeSingle(){return {data:owner?{user_id:currentUser.id,mfa_required:required}:null,error:null}}}}
};
const deps={...mfa,runtime:{url:'https://example.invalid',key:'public-test-key'},stationOriginAllowed:()=>true,photoStationRolloutReady:true,createClient:()=>client,
  jsonBody:request=>request.json(),ownerStation:async()=>{stationCalls++;return Response.json({created:true})},auditedOwnerAction:({run})=>run(),
  sendInvitationEmail(){throw Error('unexpected email')},automaticRequest(){throw Error('unexpected')},ownerAutomatic(){throw Error('unexpected')},laterRequest(){throw Error('unexpected')},ownerLater(){throw Error('unexpected')},ownerCommerce(){throw Error('unexpected')},PACKS:[],experienceRequest(){throw Error('unexpected')},ownerExperience(){throw Error('unexpected')},stationRequest(){throw Error('unexpected')},activityFor(){throw Error('unexpected')},guestRoutes(){throw Error('unexpected')},ownerRoutes(){throw Error('unexpected')},requestEmailCode(){throw Error('unexpected email')},signInWithPassword(){throw Error('unexpected')},setPassword(){throw Error('unexpected')}
};
globalThis.__boothTestDeps=deps;
globalThis.Deno={env:{get:name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'test-service-key':undefined}};
const source=transpile(process.argv[2]).replace(/^import .*?;\s*$/gm,'');
const {storefrontHandler}=await import(moduleURL('const {'+Object.keys(deps).join(',')+'}=globalThis.__boothTestDeps;\n'+source));
const jwt=aal=>'header.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.signature';
const request=async(path,{aal='aal1',method='GET',body}={})=>storefrontHandler(new Request('https://example.invalid/functions/v1/gallery-api/'+path,{method,headers:{Origin:'https://www.atelierelunora.com','X-Elunora-Request':'1',Authorization:'Bearer '+jwt(aal),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),()=>client);
let response=await request('session');assert.equal(response.status,200);assert.equal((await response.json()).owner,false); // editable metadata never promotes a customer
response=await request('owner/station/00000000-0000-0000-0000-000000000001',{method:'POST',body:{action:'create',purpose:'capture'},aal:'aal2'});assert.equal(response.status,403);assert.equal(stationCalls,0);
response=await request('mfa/status');assert.equal(response.status,403);
owner=true;
response=await request('session');let identity=await response.json();assert.equal(identity.owner,true);assert.equal(identity.aal,'aal1');
for(const enforcement of [true,false]) { required=enforcement; response=await request('owner/station/00000000-0000-0000-0000-000000000001',{method:'POST',body:{action:'create',purpose:'capture'}});assert.equal(response.status,403); }
response=await request('mfa/status');assert.equal(response.status,200);
response=await request('owner/station/00000000-0000-0000-0000-000000000001',{method:'POST',body:{action:'create',purpose:'capture'},aal:'aal2'});assert.equal(response.status,200);assert.equal(stationCalls,1);
active=false;response=await request('session',{aal:'aal2'});assert.equal(response.status,401);active=true;
authenticated=false;response=await request('session',{aal:'aal2'});assert.equal(response.status,401);authenticated=true;
const reply=(body,status=200)=>({body,status});
let challenges=0;
const mfaClient={auth:{mfa:{challengeAndVerify:async()=>{challenges++;return {data:{access_token:jwt('aal2'),refresh_token:'new-token',expires_in:3600},error:null}}},getUser:async()=>({data:{user:currentUser},error:null})}};
const state={owner:true,required:true,aal:'aal2',factors:[]};
response=await mfa.ownerMfa('mfa/verify','POST',{factorId:'invalid',code:'123456'},mfaClient,currentUser,state,reply);assert.equal(response.status,400);assert.equal(challenges,0);
response=await mfa.ownerMfa('mfa/verify','POST',{factorId:'00000000-0000-0000-0000-000000000001',code:'123456'},mfaClient,currentUser,state,reply);assert.equal(response.status,200);assert.equal(challenges,1); // already AAL2 still performs fresh challenge for unlock
mfaClient.auth.getUser=async()=>({data:{user:{id:'different-owner'}},error:null});
response=await mfa.ownerMfa('mfa/verify','POST',{factorId:'00000000-0000-0000-0000-000000000001',code:'123456'},mfaClient,currentUser,state,reply);assert.equal(response.status,401);
console.log('PASS: customer role, forged metadata, customer station denial, MFA gate with/without enforcement flag, owner AAL2 station access, revoked/invalid sessions, fresh unlock challenge, wrong-owner verification denial.');
