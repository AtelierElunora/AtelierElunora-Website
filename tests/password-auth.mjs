import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:`export {storefrontHandler} from './supabase/functions/gallery-api/handler.mts';export {runtime} from './supabase/functions/gallery-api/runtime.mts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'offline-auth',setup(b){
 b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth',namespace:'offline'}));
 b.onResolve({filter:/server-preview\.mts$/},()=>({path:'image',namespace:'offline'}));
 b.onLoad({filter:/.*/,namespace:'offline'},a=>({contents:a.path==='auth'?`export function createClient(){throw Error('Unexpected live client');}`:`export function makeServerPreview(){throw Error('Unexpected image processing');}`}));
}}]});
const {storefrontHandler,runtime}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
runtime.url='https://test.invalid';runtime.key='test-key';globalThis.Deno={env:{get:()=>undefined}};
const now=Math.floor(Date.now()/1000),user={id:'customer',email:'customer@example.test',email_confirmed_at:'2026-01-01',is_anonymous:false};
const jwt=(claims={})=>'header.'+Buffer.from(JSON.stringify({sub:user.id,aal:'aal1',amr:[{method:'otp',timestamp:now}],...claims})).toString('base64url')+'.signature';
let state,calls;
function reset(overrides={}){calls=[];state={user,active:true,owner:false,required:false,token:jwt(),...overrides};}
const session=()=>({access_token:state.token,refresh_token:'test-refresh',expires_at:now+3600,user:state.user});
function factory(_url,_key,options){assert.equal(_key,'test-key');return {
 auth:{
  signInWithPassword:async input=>{calls.push(['signInWithPassword',input]);return {data:{session:state.authError?null:session()},error:state.authError};},
  signInWithOtp:async input=>{calls.push(['otp',input]);return {error:null};},
  verifyOtp:async input=>{calls.push(['verify',input]);return {data:{session:session()},error:null};},
  getUser:async token=>{calls.push(['getUser',token]);assert.equal(token,state.token);return {data:{user:state.user},error:state.invalid?{}:null};},
  setSession:async input=>{calls.push(['setSession',input]);return {data:{session:session(),user:state.restoredUser||state.user},error:state.restoreError};},
  updateUser:async input=>{calls.push(['updateUser',input]);return {data:{user:state.user},error:state.updateError};},
 },
 rpc:async name=>{calls.push(['rpc',name]);return {data:state.active,error:state.sessionError};},
 from:table=>({select(){return this;},eq(){return this;},async maybeSingle(){assert.equal(table,'gallery_admins');return {data:state.owner?{user_id:user.id,mfa_required:state.required}:null,error:null};}})
};}
async function request(path,body,authorized=false){const response=await storefrontHandler(new Request('https://test.invalid/functions/v1/gallery-api/'+path,{method:'POST',headers:{Origin:'https://www.atelierelunora.com','X-Elunora-Request':'1','Content-Type':'application/json',...(authorized?{Authorization:'Bearer '+state.token}:{})},body:JSON.stringify(body)}),factory);assert.match(response.headers.get('Cache-Control'),/no-store/);return {status:response.status,body:await response.json()};}
const credentials={email:' Customer@Example.Test ',password:'a long unique passphrase',captchaToken:'challenge'};
reset();let out=await request('password-login',credentials);assert.equal(out.status,200);assert.equal(calls[0][1].email,'customer@example.test');assert.equal(calls[0][1].password,credentials.password);assert.deepEqual(calls[0][1].options,{captchaToken:'challenge'});assert.equal(out.body.refresh_token,'test-refresh');assert.ok(!JSON.stringify(out.body).includes(credentials.password));
for(const body of [{...credentials,password:''},{...credentials,password:'a'.repeat(129)},{...credentials,captchaToken:''},{...credentials,captchaToken:null},{...credentials,email:'invalid'}]){reset();assert.equal((await request('password-login',body)).status,400);assert.equal(calls.length,0);}
let generic;
for(const code of ['invalid_credentials','email_not_confirmed','user_banned']){reset({authError:{status:400,code}});out=await request('password-login',credentials);assert.equal(out.status,400);generic??=out.body;assert.deepEqual(out.body,generic);}
for(const [error,status] of [[{code:'captcha_failed',status:400},400],[{status:429},429],[{status:503},503]]){reset({authError:error});assert.equal((await request('password-login',credentials)).status,status);}
reset();assert.equal((await request('login',{email:credentials.email,captchaToken:'challenge'})).status,200);assert.equal(calls[0][0],'otp');
reset();assert.equal((await request('verify',{email:credentials.email,token:'12345678'})).status,200);assert.equal(calls[0][0],'verify');
const save={password:credentials.password,refresh_token:'test-refresh'};
reset();assert.equal((await request('password',save)).status,401);assert.equal(calls.length,0);
for(const overrides of [{invalid:true},{active:false},{sessionError:{}},{user:{...user,is_anonymous:true}},{user:{...user,email_confirmed_at:null}},{token:jwt({amr:[{method:'password',timestamp:now}]})},{token:jwt({amr:[{method:'otp',timestamp:now-601}]})},{token:jwt({sub:'someone-else'})},{token:jwt({amr:[{method:'otp',timestamp:now+100}]})},{token:'invalid'},{owner:true,required:true},{owner:true,required:false},{restoredUser:{id:'someone-else'}},{restoreError:{}}]){
 reset(overrides);out=await request('password',save,true);assert.ok(out.status>=400,JSON.stringify(overrides));assert.ok(!calls.some(c=>c[0]==='updateUser'));
}
for(const password of ['short','a'.repeat(129),null]){reset();assert.equal((await request('password',{...save,password},true)).status,400);assert.ok(!calls.some(c=>c[0]==='updateUser'));}
for(const overrides of [{},{token:jwt({amr:[{method:'email/signup',timestamp:now}]})},{owner:true,required:true,token:jwt({aal:'aal2',amr:[{method:'otp',timestamp:now},{method:'totp',timestamp:now}]})}]){
 reset(overrides);out=await request('password',save,true);assert.equal(out.status,200);assert.deepEqual(calls.find(c=>c[0]==='updateUser')[1],{password:save.password});assert.ok(calls.findIndex(c=>c[0]==='getUser')<calls.findIndex(c=>c[0]==='updateUser'));assert.ok(calls.some(c=>c[0]==='rpc'&&c[1]==='gallery_session_active'));
}
for(const [code,status] of [['weak_password',400],['same_password',400],['over_request_rate_limit',429]]){reset({updateError:{code,status}});out=await request('password',save,true);assert.equal(out.status,status);}
console.log('PASS: password login, email normalization, CAPTCHA and rate limits, account privacy, code fallback, authenticated recent email verification, revoked/expired/anonymous session rejection, and owner AAL2 password gate. No live auth calls.');
