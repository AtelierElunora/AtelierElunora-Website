import {ownerStation,stationRequest} from './station.mjs';
import {makeServerPreview} from './server-preview.mts';
import {activityFor,auditedOwnerAction} from './activity.mjs';
import {createClient} from '@supabase/supabase-js';
import {runtime} from './runtime.mts';
import {guestRoutes,ownerRoutes,jsonBody} from './gallery.mts';
import {ownerState, ownerMfa, needsMfa} from './owner-mfa.mts';
import {requestEmailCode} from './login.mts';

export async function storefrontHandler(request:Request, factory=createClient){
 const headers=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Origin','X-Content-Type-Options':'nosniff'});
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
 const origin=request.headers.get('origin')||'';
 if(!['https://www.atelierelunora.com','https://atelierelunora.com','https://v0j63n-ms.myshopify.com','https://admin.shopify.com','https://extensions.shopifycdn.com'].includes(origin))return reply({error:'Open the gallery on Atelier Elunora.'},403);
 headers.set('Access-Control-Allow-Origin',origin);
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
  if(path==='station'){
   if(Deno.env.get('PHOTO_STATION_ENABLED')!=='true')return reply({error:'Photo station is not enabled yet.'},503);
   if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
   if(!secret)return reply({error:'Station unavailable.'},503);
   const service=factory(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
   return await stationRequest(await jsonBody(request,5700000),service,reply,makeServerPreview);
  }
  if(['login','verify','refresh','logout'].includes(path)&&request.method==='POST'){
   const b=await jsonBody(request,8192);
   if(path==='login'||path==='verify'){
    if(typeof b.email!=='string'||b.email.length>254||!/^\S+@\S+\.\S+$/.test(b.email.trim()))return reply({error:'Enter a valid email.'},400);
    const email=b.email.trim().toLowerCase();
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
  if(path.startsWith('mfa/'))return await ownerMfa(path,request.method,request.method==='POST'?await jsonBody(request,4096):{},client,data.user,security,reply);
  if(needsMfa(security))return reply({error:'Verify your authenticator in the owner app to continue.',code:'MFA_REQUIRED'},403);
  if(path.startsWith('owner/station/')){
   if(Deno.env.get('PHOTO_STATION_ENABLED')!=='true')return reply({error:'Photo station is not enabled yet.'},503);
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

