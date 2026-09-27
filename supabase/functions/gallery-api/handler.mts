import {stationOriginAllowed} from './station-origin.mjs';
import {automaticRequest,ownerAutomatic} from './automatic.mjs';
import {laterRequest,ownerLater} from './upload-later.mjs';
import {ownerCommerce} from './owner-commerce.mjs';
import {PACKS} from './commerce.mts';
import {photoStationRolloutReady} from './station-rollout.mts';
import {experienceRequest,ownerExperience} from './experience.mjs';
import {ownerStation,stationRequest} from './station.mjs';
// Load the image engine only when a capture needs rendering, as owner uploads do.
const makeServerPreview=async(bytes:Uint8Array)=>{const renderer=await import('./server-preview.mts');return renderer.makeServerPreview(bytes);};
import {activityFor,auditedOwnerAction} from './activity.mjs';
import {createClient} from '@supabase/supabase-js';
import {runtime} from './runtime.mts';
import {guestRoutes,ownerRoutes,jsonBody} from './gallery.mts';
import {ownerState, ownerMfa, needsMfa} from './owner-mfa.mts';
import {requestEmailCode, signInWithPassword, setPassword} from './login.mts';

export async function storefrontHandler(request:Request, factory=createClient){
 const headers=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Origin','X-Content-Type-Options':'nosniff'});
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
 const origin=request.headers.get('origin')||'';
 if(!stationOriginAllowed(request,(Deno.env.get('NATIVE_CAPTURE_ENABLED')??'true')==='true'))return reply({error:'Open the gallery on Atelier Elunora.'},403);
 if(origin)headers.set('Access-Control-Allow-Origin',origin);
 headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Elunora-Request');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
 if(request.headers.get('x-elunora-request')!=='1')return reply({error:'Use the gallery page.'},403);
 const base=runtime.url,key=runtime.key;
 if(!base||!key)return reply({error:'Gallery access is temporarily unavailable.'},503);
 const auth=request.headers.get('authorization')||'';
 const client=factory(base,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:auth?{Authorization:auth}:{}}});
 const pathname=new URL(request.url).pathname;
 const marker='/gallery-api/';
 if(!pathname.includes(marker))return reply({error:'Not found.'},404);
 const path=pathname.slice(pathname.indexOf(marker)+marker.length);
 try{
  if(path==='automatic'&&request.method==='POST'){
   if((Deno.env.get('PRINT_HELPER_ENABLED')??'true')!=='true')return reply({error:'Automatic print helper is not enabled. Use the manual print desk.'},503);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Print helper unavailable.'},503);
   return await automaticRequest(await jsonBody(request,16000),factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}}),reply,{nativeEnabled:(Deno.env.get('PRINT_HELPER_NATIVE_ENABLED')??'true')==='true',simulationEnabled:Deno.env.get('PRINT_HELPER_SIMULATION_ENABLED')==='true'});
  }
  if(path==='shop-session'&&request.method==='POST'){
   const b=await jsonBody(request,8192);
   if(typeof b.captchaToken!=='string'||!b.captchaToken||b.captchaToken.length>4096)return reply({error:'Complete the security check to continue.'},400);
   const {data,error}=await client.auth.signInAnonymously({options:{captchaToken:b.captchaToken}});
   if(error||!data.session)return reply({error:error?.status===429?'Please wait a moment before trying again.':'Could not start your private upload. Please retry the security check.'},error?.status===429?429:503);
   const s=data.session;return reply({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at,email:'',is_anonymous:true});
  }
  if(path==='upload-later'&&request.method==='POST'){
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Uploads unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await laterRequest(await jsonBody(request,70000),service,reply);
  }
  if(path==='experience'){
   if((Deno.env.get('EXPERIENCE_ENABLED')??'true')!=='true')return reply({error:'Guest uploads are not open yet.'},503);
   if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Uploads unavailable.'},503);
   let user=null;
   if(auth){const result=await client.auth.getUser(auth.slice(7));const active=await client.rpc('gallery_session_active');if(result.error||!result.data.user||active.data!==true)return reply({error:'Please sign in again.'},401);user=result.data.user;}
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await experienceRequest(await jsonBody(request,16000),service,reply,makeServerPreview,user);
  }
  if(path==='station'){
   if(!photoStationRolloutReady||(Deno.env.get('PHOTO_STATION_ENABLED')??'true')!=='true')return reply({error:'Photo station is not enabled yet.'},503);
   if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
   if(!secret)return reply({error:'Station unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await stationRequest(await jsonBody(request,5700000),service,reply,makeServerPreview);
  }
  if(['login','verify','password-login','refresh','logout'].includes(path)&&request.method==='POST'){
   const b=await jsonBody(request,8192);
   if(path==='login'||path==='verify'||path==='password-login'){
    if(typeof b.email!=='string'||b.email.length>254||!/^\S+@\S+\.\S+$/.test(b.email.trim()))return reply({error:'Enter a valid email.'},400);
    const email=b.email.trim().toLowerCase();
    if(path==='password-login')return await signInWithPassword(client,email,b.password,b.captchaToken,reply);
    if(path==='login'){
     return await requestEmailCode(client,email,b.captchaToken,reply);
    }
    if(typeof b.token!=='string'||!/^\d{8}$/.test(b.token))return reply({error:'Enter the eight-digit email code.'},400);
    const {data,error}=await client.auth.verifyOtp({email,token:b.token,type:'email'});
    if(error||!data.session)return reply({error:'That code is incorrect or expired. Request a new code.'},400);
    const s=data.session;return reply({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at,email:s.user.email});
   }
   if(typeof b.refresh_token!=='string'||!b.refresh_token||b.refresh_token.length>2048)return reply({error:'Please sign in again.'},401);
   if(path==='refresh'){
    const {data,error}=await client.auth.refreshSession({refresh_token:b.refresh_token});
    if(error||!data.session)return reply({error:'Please sign in again.'},401);
    const s=data.session;return reply({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at,email:s.user.email});
   }
   if(!auth.startsWith('Bearer '))return reply({error:'Please sign in again.'},401);
   const {error}=await client.auth.setSession({access_token:auth.slice(7),refresh_token:b.refresh_token});
   if(error)return reply({error:'Please sign in again.'},401);
   const out=await client.auth.signOut({scope:'local'});
   return out.error?reply({error:'Could not complete sign-out.'},503):reply({signedIn:false});
  }
  if(!auth.startsWith('Bearer ')||auth.length>8192)return reply({error:'Please sign in again.'},401);
  const {data,error}=await client.auth.getUser(auth.slice(7));
  if(error||!data.user)return reply({error:'Please sign in again.'},401);
  const session=await client.rpc('gallery_session_active');
  if(session.error)return reply({error:'Unable to verify your session. Please retry.'},503);
  if(session.data!==true)return reply({error:'Please sign in again.'},401);
  const security=await ownerState(client,data.user,auth.slice(7));
  if(path==='session'&&request.method==='GET')return reply({email:data.user.email,owner:security.owner,mfaRequired:security.required,aal:security.aal});
  if(path.startsWith('mfa/'))return await ownerMfa(path,request.method,request.method==='POST'?await jsonBody(request,4096):{},client,data.user,security,reply,async()=>{
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return false;
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   const result=await service.auth.admin.updateUserById(data.user.id,{app_metadata:{owner_mfa_enrollment_until:null}});
   return !result.error;
  });
  if(needsMfa(security))return reply({error:'Verify your authenticator in the owner app to continue.',code:'MFA_REQUIRED'},403);
  if(path==='password'&&request.method==='POST')return await setPassword(client,data.user,security,auth.slice(7),await jsonBody(request,8192),reply);
  if(path==='owner/commerce'&&request.method==='GET'){
   if(!security.owner||security.aal!=='aal2')return reply({error:'Owner authenticator verification required.'},403);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Online store unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await ownerCommerce(service,reply,PACKS,runtime.checkoutEnabled);
  }
  if(path==='owner/upload-later'&&request.method==='POST'){
   if(!security.owner||security.aal!=='aal2')return reply({error:'Owner authenticator verification required.'},403);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Orders unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await ownerLater(await jsonBody(request,2048),service,reply,{secret:Deno.env.get('SHOPIFY_WEBHOOK_SECRET'),key:Deno.env.get('RESEND_API_KEY')});
  }
  if(path==='owner/production'&&request.method==='POST'){
   if((Deno.env.get('EXPERIENCE_ENABLED')??'true')!=='true')return reply({error:'Production integration is not enabled yet.'},503);
   if(!security.owner||security.aal!=='aal2')return reply({error:'Owner authenticator verification required.'},403);
   const body=await jsonBody(request,1024);if(typeof body.requestId!=='string'||! /^[0-9a-f-]{36}$/i.test(body.requestId))return reply({error:'Invalid order.'},400);
   const snapshot=await client.from('gallery_requests').select('id,event_id').eq('id',body.requestId).maybeSingle();if(snapshot.error||!snapshot.data)return reply({error:'Order unavailable.'},404);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Production unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await auditedOwnerAction({service,actor:data.user.id,activity:{action:'order.queue',event_id:snapshot.data.event_id},reply,run:async()=>{const r=await service.rpc('gallery_order_produce',{p_request:body.requestId});return r.error?reply({error:'This order needs review. Verify payment, photo availability and cancellation/refund status.'},409):reply({queued:r.data});}});
  }
  if(path.startsWith('owner/experience/')){
   if((Deno.env.get('EXPERIENCE_ENABLED')??'true')!=='true')return reply({error:'Guest uploads are not open yet.'},503);
   if(!security.owner||security.aal!=='aal2')return reply({error:'Owner authenticator verification required.'},403);
   const parts=path.split('/');if(parts.length!==3||! /^[0-9a-f-]{36}$/i.test(parts[2])||request.method!=='POST')return reply({error:'Not found.'},404);
   const event=await client.from('gallery_events').select('id,deleted_at,purge_started_at').eq('id',parts[2]).maybeSingle();
   if(event.error||!event.data||event.data.deleted_at||event.data.purge_started_at)return reply({error:'Event unavailable.'},404);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Uploads unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}}),body=await jsonBody(request,4096);
   const run=()=>ownerExperience(parts[2],body,service,reply);
   return body.action==='list'?await run():await auditedOwnerAction({service,actor:data.user.id,activity:{action:'experience.manage',event_id:parts[2]},run,reply});
  }
  if(path.startsWith('owner/automatic/')){
   if((Deno.env.get('PRINT_HELPER_ENABLED')??'true')!=='true')return reply({error:'Automatic print helper is not enabled. Manual printing remains available.'},503);
   if(!security.owner||security.aal!=='aal2')return reply({error:'Owner authenticator verification required.'},403);
   const parts=path.split('/');if(parts.length!==3||! /^[0-9a-f-]{36}$/i.test(parts[2])||request.method!=='POST')return reply({error:'Not found.'},404);
   const event=await client.from('gallery_events').select('id,deleted_at,purge_started_at').eq('id',parts[2]).maybeSingle();
   if(event.error||!event.data||event.data.deleted_at||event.data.purge_started_at)return reply({error:'Event unavailable.'},404);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return reply({error:'Print helper unavailable.'},503);
   return await ownerAutomatic(parts[2],data.user.id,await jsonBody(request,16000),factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}}),reply);
  }
  if(path.startsWith('owner/station/')){
   if(!photoStationRolloutReady||(Deno.env.get('PHOTO_STATION_ENABLED')??'true')!=='true')return reply({error:'Photo station is not enabled yet.'},503);
   if(!security.owner||security.aal!=='aal2')return reply({error:'Owner authenticator verification required.'},403);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
   if(!secret)return reply({error:'Station unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   const parts=path.split('/');
   const body=request.method==='POST'?await jsonBody(request,4096):{};
   const run=()=>ownerStation(request,parts,client,service,data.user!.id,body,reply);
   if(request.method==='GET')return await run();
   return await auditedOwnerAction({service,actor:data.user.id,activity:{action:'station.manage',event_id:/^[0-9a-f-]{36}$/i.test(parts[2])?parts[2]:null},run,reply});
  }
  if(path==='owner'||path.startsWith('owner/')){
   const parts=path.split('/');
   const activity=security.owner?activityFor(request,parts):null;
   const run=()=>ownerRoutes(request,parts,client,reply,headers);
   if(!activity)return await run();
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
   if(!secret)return reply({error:'Activity logging is temporarily unavailable. No action was started. Please retry.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await auditedOwnerAction({service,actor:data.user.id,activity,run,reply});
  }
  if(!path.startsWith('events'))return reply({error:'Not found.'},404);
  return await guestRoutes(request,path.split('/'),client,data.user,reply,headers);
 }catch{return reply({error:'Unable to complete this request. Please retry.'},400);}
}
export default async function handler(request:Request){return storefrontHandler(request);}
