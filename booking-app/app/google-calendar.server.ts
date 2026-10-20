import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import db from './db.server';
import {locked,hash,token} from './booking.server';
import {CALENDAR_SCOPE,calendarEvent,calendarFingerprint,encryptSecret,decryptSecret,retryDelay} from './google-calendar';
type SyncEntry={fingerprint?:string;status:string;lastSyncedAt?:string;attempts?:number;retryAt?:number;error?:string;eventId?:string;};
type Connection={credentials?:string;calendarId?:string;connectedAt?:string;generation?:string;entries?:Record<string,SyncEntry>;lease?:{id:string;until:number};ticketHash?:string;ticketExpires?:number;stateHash?:string;stateExpires?:number;verifier?:string;error?:string};
const key=()=>process.env.BOOKING_GOOGLE_TOKEN_KEY||'';
export function googleReady(){return !!process.env.GOOGLE_CALENDAR_CLIENT_ID && !!process.env.GOOGLE_CALENDAR_CLIENT_SECRET && /^[a-f0-9]{64}$/.test(key());}
const callbackUrl=()=>process.env.SHOPIFY_APP_URL+'/google-calendar/callback';
async function editConnection<T>(shop:string,fn:(c:Connection)=>T){return locked(shop,async tx=>{const s=await tx.bookingSettings.findUniqueOrThrow({where:{shop}}),config=JSON.parse(s.configJson);const c:Connection=config.googleCalendar||{};const result=fn(c);config.googleCalendar=c;await tx.bookingSettings.update({where:{shop},data:{configJson:JSON.stringify(config)}});return result;});}
export async function calendarStatus(shop:string,id?:string){
  const s=await db.bookingSettings.findUnique({where:{shop}}),c:Connection=s?JSON.parse(s.configJson).googleCalendar||{}:{};
  let entry=id?c.entries?.[id]||null:null;
  if(entry&&id){const b=await db.weddingBooking.findFirst({where:{shop,id}});if(b&&entry.fingerprint!==calendarFingerprint(b)&&entry.status!=="failed")entry={...entry,status:"pending"};}
  return {ready:googleReady(),connected:!!c.credentials,calendarId:c.calendarId||null,connectedAt:c.connectedAt||null,error:c.error||null,entry,entries:Object.values(c.entries||{}).map(e=>({status:e.status}))};
}
export async function prepareGoogleConnect(shop:string){if(!googleReady())throw Error('Google Cloud credentials still need to be configured.');const raw=token();await editConnection(shop,c=>{c.ticketHash=hash(raw);c.ticketExpires=Date.now()+600000;});return process.env.SHOPIFY_APP_URL+'/google-calendar/start?shop='+encodeURIComponent(shop)+'&ticket='+raw;}
export async function startGoogleConnect(shop:string,ticket:string){
  if(!googleReady()||!shop.endsWith('.myshopify.com')||!/^[a-f0-9]{64}$/.test(ticket))throw Error('Connection link unavailable.');
  const state=shop+':'+token(),verifier=randomBytes(32).toString('base64url');
  await editConnection(shop,c=>{if(c.ticketHash!==hash(ticket)||!c.ticketExpires||c.ticketExpires<Date.now())throw Error('Connection link expired. Return to the app to connect again.');delete c.ticketHash;delete c.ticketExpires;c.stateHash=hash(state);c.stateExpires=Date.now()+600000;c.verifier=encryptSecret(verifier,key());});
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:process.env.GOOGLE_CALENDAR_CLIENT_ID!,redirect_uri:callbackUrl(),response_type:'code',scope:CALENDAR_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return {url:u.toString(),state};
}
async function tokenRequest(body:Record<string,string>){const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:process.env.GOOGLE_CALENDAR_CLIENT_ID!,client_secret:process.env.GOOGLE_CALENDAR_CLIENT_SECRET!}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Google authorization expired or was rejected. Reconnect Google Calendar.');return await r.json();}
export async function finishGoogleConnect(state:string,cookie:string,code:string){
  if(!state||!cookie||Buffer.byteLength(state)!==Buffer.byteLength(cookie)||!timingSafeEqual(Buffer.from(state),Buffer.from(cookie)))throw Error('Google sign-in could not be verified. Connect again from the app.');
  const shop=state.split(':')[0];if(!shop.endsWith('.myshopify.com'))throw Error('Invalid connection.');
  const verifier=await editConnection(shop,c=>{if(c.stateHash!==hash(state)||!c.stateExpires||c.stateExpires<Date.now()||!c.verifier)throw Error('Google sign-in expired. Connect again.');const v=decryptSecret(c.verifier,key());delete c.stateHash;delete c.stateExpires;delete c.verifier;return v;});
  if(!code)throw Error('Google Calendar permission was not granted.');
  const credentials=await tokenRequest({code,grant_type:'authorization_code',redirect_uri:callbackUrl(),code_verifier:verifier});
  if(!credentials.refresh_token || !String(credentials.scope||'').split(' ').includes(CALENDAR_SCOPE))throw Error('Google did not grant ongoing booking-calendar access. Connect again.');
  const s=await db.bookingSettings.findUniqueOrThrow({where:{shop}}),prior:Connection=JSON.parse(s.configJson).googleCalendar||{};
  let calendarId=prior.calendarId;
  if(calendarId)await googleRequest(credentials.access_token,'/calendars/'+encodeURIComponent(calendarId));
  else {const calendar=await googleRequest(credentials.access_token,'/calendars','POST',{summary:'Atelier Elunora · Bookings (Direct Sync)',timeZone:'America/New_York',description:'Confirmed bookings managed by Atelier Elunora Bookings.'});calendarId=calendar.id;}
  await editConnection(shop,c=>{c.credentials=encryptSecret(JSON.stringify({refresh_token:credentials.refresh_token}),key());c.calendarId=calendarId;c.connectedAt=new Date().toISOString();c.generation=token();c.error=undefined;c.lease=undefined;});
  return shop;
}
class GoogleFailure extends Error{constructor(public status:number){super(status===401||status===403?'Google Calendar access needs review. Reconnect if necessary.':'Google Calendar is temporarily unavailable. The app will retry.');}}
async function googleRequest(access:string,path:string,method='GET',body?:unknown){const r=await fetch('https://www.googleapis.com/calendar/v3'+path,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!r.ok)throw new GoogleFailure(r.status);return r.status===204?null:r.json();}
export async function disconnectGoogle(shop:string){await editConnection(shop,c=>{delete c.credentials;delete c.lease;delete c.ticketHash;delete c.stateHash;delete c.verifier;c.generation=token();});}
export async function retryGoogle(shop:string,id?:string){await editConnection(shop,c=>{for(const [bookingId,e] of Object.entries(c.entries||{})){if(!id||id===bookingId){e.retryAt=0;e.attempts=0;e.fingerprint=undefined;}}});await runGoogleCalendar(shop);}
let running=false;
export async function runGoogleCalendar(onlyShop?:string){
  if(running||!googleReady())return;running=true;
  try{for(const s of await db.bookingSettings.findMany({where:onlyShop?{shop:onlyShop}:undefined})){
    const lease=token();
    const connection=await editConnection(s.shop,c=>{if(!c.credentials||!c.calendarId||(c.lease&&c.lease.until>Date.now()))return null;c.lease={id:lease,until:Date.now()+180000};return structuredClone(c);});
    if(!connection)continue;
    try{
      const saved=JSON.parse(decryptSecret(connection.credentials!,key()));const auth=await tokenRequest({grant_type:'refresh_token',refresh_token:saved.refresh_token});
      const bookings=await db.weddingBooking.findMany({where:{shop:s.shop,OR:[{status:'confirmed'},{id:{in:Object.keys(connection.entries||{})}}]}});
      let processed=0;
      for(const b of bookings){
        const current=await db.weddingBooking.findUniqueOrThrow({where:{id:b.id}}),fp=calendarFingerprint(current),entry=connection.entries?.[b.id];
        if(entry?.fingerprint===fp && ['synced','removed'].includes(entry.status)|| (entry?.retryAt||0)>Date.now())continue;
        if(++processed>25)break;
        const permitted=await editConnection(s.shop,c=>c.generation===connection.generation&&c.lease?.id===lease);
        if(!permitted)break;
        const event=calendarEvent(current),path='/calendars/'+encodeURIComponent(connection.calendarId!)+'/events';
        let next:SyncEntry;
        try{
          if(current.status==='confirmed'){
            try{await googleRequest(auth.access_token,path+'/'+event.id,'PUT',event);}catch(e){if(!(e instanceof GoogleFailure)||e.status!==404)throw e;try{await googleRequest(auth.access_token,path,'POST',event);}catch(insert){if(!(insert instanceof GoogleFailure)||insert.status!==409)throw insert;await googleRequest(auth.access_token,path+'/'+event.id,'PUT',event);}}
          }else {try{await googleRequest(auth.access_token,path+'/'+event.id,'DELETE');}catch(e){if(!(e instanceof GoogleFailure)||![404,410].includes(e.status))throw e;}}
          next={status:current.status==='confirmed'?'synced':'removed',fingerprint:fp,eventId:event.id,lastSyncedAt:new Date().toISOString(),attempts:0};
        }catch(e){const attempts=(entry?.attempts||0)+1;next={...entry,status:'failed',attempts,retryAt:Date.now()+retryDelay(attempts),error:e instanceof GoogleFailure?e.message:'Calendar sync interrupted. The app will retry.'};}
        await editConnection(s.shop,c=>{if(c.generation===connection.generation&&c.lease?.id===lease){c.entries={...c.entries,[b.id]:next};c.lease.until=Date.now()+180000;}});
      }
      await editConnection(s.shop,c=>{if(c.generation===connection.generation)c.error=undefined;});
    }catch{await editConnection(s.shop,c=>{if(c.generation===connection.generation)c.error='Google Calendar connection needs review. Use Connect Google Calendar to authorize again.';});}
    finally{await editConnection(s.shop,c=>{if(c.lease?.id===lease)delete c.lease;});}
  }}finally{running=false;}
}
export function startGoogleCalendarWorker(){const timer=setInterval(()=>{void runGoogleCalendar().catch(()=>console.error('Calendar sync needs review'));},30000);timer.unref();}
