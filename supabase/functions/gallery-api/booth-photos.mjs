import {hash,uuid} from './station.mjs';

export function boothContact(input){
 if(input==null)return null;
 if(input.consent!==true||!['email','sms'].includes(input.channel)||typeof input.recipient!=='string')throw Error('Choose email or text and agree to receive your photo invitation.');
 const recipient=input.channel==='email'?input.recipient.trim().toLowerCase():input.recipient.replace(/[ ()-]/g,'');
 if(input.channel==='email'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||recipient.length>254:!/^\+[1-9][0-9]{7,14}$/.test(recipient))throw Error(input.channel==='email'?'Enter a valid email address.':'Include the country code, such as +1, in your phone number.');
 return {channel:input.channel,recipient,consent:true};
}
export const boothConfig=()=>({emailKey:Deno.env.get('RESEND_API_KEY'),smsAccount:Deno.env.get('TWILIO_ACCOUNT_SID'),smsKey:Deno.env.get('TWILIO_AUTH_TOKEN'),smsService:Deno.env.get('TWILIO_MESSAGING_SERVICE_SID'),enabled:Deno.env.get('BOOTH_PHOTO_INVITES_ENABLED')==='true'});
export function boothChannels(config){return config.enabled?[...(config.emailKey?['email']:[]),...(config.smsAccount&&config.smsKey&&config.smsService?['sms']:[])]:[];}
const messages={accepted:'Your photo invitation was accepted for sending. Check your messages.',busy:'Your photo is saved. The invitation is being sent; retry in a moment.',cooldown:'Your photo is saved. Wait a minute before retrying the invitation.',review:'Your photo is saved. Ask the attendant to review the invitation before sending again.',limited:'Your photo is saved. Invitation limit reached; ask the attendant.',unavailable:'Your photo is saved, but this invitation is unavailable.',unconfigured:'Your photo is saved. This invitation option needs setup; ask the attendant.',failed:'Your photo is saved. The invitation was not accepted; retry or ask the attendant.',uncertain:'Your photo is saved. Invitation acceptance could not be confirmed; ask the attendant.'};
export async function sendBoothInvitation(service,digest,requestId,contact,config,fetcher=fetch){
 if(!boothChannels(config).includes(contact.channel))return {status:'unconfigured',message:messages.unconfigured};
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const lease=crypto.randomUUID();
 const prepared=await service.rpc('gallery_booth_prepare',{p_hash:digest,p_request:requestId,p_channel:contact.channel,p_recipient:contact.recipient,p_token:token,p_token_hash:await hash(token),p_lease:lease});
 if(prepared.error||!prepared.data)return {status:'unavailable',message:messages.unavailable};
 const {status:state,delivery:d}=prepared.data;
 if(state!=='send')return {status:state,message:messages[state]||messages.unavailable};
 const url='https://www.atelierelunora.com/pages/client-gallery#booth='+d.link_token;
 const text='Atelier Elunora: your booth photo is ready. Create an account or sign in to save it: '+url+'\nThis private link expires in 14 days. Keep it private. No marketing subscription.';
 let status='uncertain',providerId=null;
 try{
  let response;
  if(contact.channel==='email'){
   response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.emailKey,'Content-Type':'application/json','Idempotency-Key':'booth-photo/'+d.id},body:JSON.stringify({from:'Atelier Elunora <support@atelierelunora.com>',reply_to:'support@atelierelunora.com',to:[d.recipient],subject:'Your Atelier Elunora booth photo',text,html:`<!doctype html><html lang="en"><head><title>Your booth photo</title></head><body style="font-family:Arial,sans-serif;background:#EBE5D9;color:#414827;padding:24px"><h1>Your memory is ready.</h1><p>Create an account or sign in with the email where you received this message to save your booth photo.</p><p><a href="${url}" style="color:#414827">Open my photo</a></p><p>This private link expires in 14 days. Keep it private. This message does not subscribe you to marketing.</p><p>With care,<br>Atelier Elunora</p></body></html>`}),signal:AbortSignal.timeout(10000)});
   if(response.ok){const result=await response.json();if(typeof result.id==='string'&&result.id){status='accepted';providerId=result.id;}}
  }else{
   response=await fetcher('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(config.smsAccount)+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+btoa(config.smsAccount+':'+config.smsKey),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:d.recipient,MessagingServiceSid:config.smsService,Body:text}),signal:AbortSignal.timeout(10000)});
   if(response.ok){const result=await response.json();if(typeof result.sid==='string'&&result.sid){status='accepted';providerId=result.sid;}}
  }
  if(!response.ok&&response.status>=400&&response.status<500)status=response.status===409?'uncertain':'failed';
 }catch{/* Preserve ambiguity; SMS retries never assume the provider rejected it. */}
 const saved=await service.from('gallery_booth_invitations').update({status,provider_id:providerId,lease_until:null}).eq('id',d.id).eq('lease_id',lease).select('id').maybeSingle();
 if(saved.error||!saved.data)status='uncertain';
 return {status,message:messages[status]};
}

// Called after handler verifies user, current session and MFA. Service reads are
// limited to the photo grant owned by that verified user; no event-wide access.
export async function boothPhotoRoutes(request,parts,client,service,user,reply,headers,body){
 if(parts.join('/')==='customer/booth/claim'&&request.method==='POST'){
  if(typeof body?.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token))return reply({error:'Open a valid photo invitation.'},400);
  const r=await service.rpc('gallery_booth_claim',{p_token_hash:await hash(body.token),p_user:user.id});
  return r.error?reply({error:'This invitation is expired, already claimed, or belongs to another email. Ask the attendant.'},403):reply(r.data);
 }
 if(parts[2]!=='photos'||request.method!=='GET'||![3,5].includes(parts.length)||(parts.length===5&&(!uuid(parts[3])||!['preview','original'].includes(parts[4]))))return reply({error:'Not found.'},404);
 const lookup=()=>service.rpc('gallery_booth_photos',{p_user:user.id,p_photo:parts.length===5?parts[3]:null});
 const result=await lookup();if(result.error)return reply({error:'Booth photos unavailable.'},503);
 if(parts.length===3)return reply({photos:(result.data||[]).map(p=>({id:p.id,eventName:p.eventName,filename:p.filename,expiresAt:p.expiresAt}))});
 const photo=result.data?.[0],original=parts[4]==='original',key=photo?.[original?'original_key':'preview_key'];
 if(!photo||typeof key!=='string'||!key.startsWith(photo.eventId+'/'+photo.id+'/')||key.includes('..')||!/^[-a-zA-Z0-9_/\.]+$/.test(key))return reply({error:'Photo unavailable.'},404);
 const limit=original?25*1024*1024:1024*1024;
 if(!Number.isFinite(photo[original?'original_bytes':'preview_bytes'])||photo[original?'original_bytes':'preview_bytes']<=0||photo[original?'original_bytes':'preview_bytes']>limit)return reply({error:'Photo unavailable.'},404);
 const blob=await service.storage.from(original?'gallery-originals':'gallery-previews').download(key);
 if(blob.error||!blob.data||blob.data.size>limit)return reply({error:'Photo unavailable.'},503);
 const [again,active]=await Promise.all([lookup(),client.rpc('gallery_session_active')]);
 if(active.error||active.data!==true)return reply({error:'Sign in again.'},401);
 if(again.error)return reply({error:'Unable to verify photo access.'},503);
 if(again.data?.[0]?.[original?'original_key':'preview_key']!==key)return reply({error:'Photo unavailable.'},404);
 const out=new Headers(headers);out.set('Content-Type','image/jpeg');out.set('Cache-Control','private, no-store');out.set('X-Content-Type-Options','nosniff');
 if(original)out.set('Content-Disposition','attachment; filename="'+String(photo.filename||'booth-photo.jpg').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)+'"');
 return new Response(blob.data,{headers:out});
}
