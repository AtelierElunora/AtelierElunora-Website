import {guestOriginal} from './guest-original.mjs';
import {guestPreview} from './guest-preview.mts';
import {createClient} from '@supabase/supabase-js';
import {purgeEvent} from './purge.mjs';
import {processUpload} from './process-upload.mts';
import type {User} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {Buffer} from 'node:buffer';
import {samplePhoto} from './samples.mjs';
import {runtime} from './runtime.mts';
import {randomUUID} from 'node:crypto';
import {PACKS,packFor,checkPrice,createCheckout} from './commerce.mts';
import {prepareNineMags} from './ninemags.mts';

type Reply=(body:unknown,status?:number)=>Response;
export function uploadFailureCode(error:unknown){
 const e=(error&&typeof error==='object'?error:{}) as Record<string,unknown>;
 const status=Number(e.statusCode??e.status);
 const code=typeof e.code==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(e.code)?e.code:'Unknown';
 const message=typeof e.message==='string'?e.message.toLowerCase():'';
 const reason=/row.level security|permission denied|not authorized/.test(message)?'permission':/jwt|signature|token.*expired/.test(message)?'authentication':/bucket.*not found|bucket.*not exist/.test(message)?'bucket-missing':/fetch|network|timeout|timed out|connection/.test(message)?'network':/invalid url|no token returned/.test(message)?'signing-response':'storage';
 // Never return raw provider messages: they can contain URLs, tokens or object paths.
 return `${Number.isInteger(status)&&status>=100&&status<=599?status:'no-status'}/${code}/${reason}`;
}
export async function jsonBody(request:Request,limit=16000){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON required.');
 const reader=request.body?.getReader();if(!reader)throw Error('Request required.');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>limit){await reader.cancel();throw Error('Request too large.');}chunks.push(c.value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function isOwner(client:SupabaseClient){const {data,error}=await client.from('gallery_admins').select('user_id').maybeSingle();return !error&&!!data;}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const mimeExtensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
function actualMime(b:Uint8Array){if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(Buffer.from(b.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(Buffer.from(b.subarray(0,4)).toString()==='RIFF'&&Buffer.from(b.subarray(8,12)).toString()==='WEBP')return 'image/webp';return '';}

export async function ownerRoutes(request:Request,parts:string[],client:SupabaseClient,reply:Reply,headers:Headers){
 if(!await isOwner(client))return reply({error:'Owner access required.'},403);
 if(parts[1]==='activity'&&parts.length===2&&request.method==='GET'){
  const {data,error}=await client.from('gallery_activity_log').select('id,occurred_at,source,operation_id,actor_user_id,event_id,action,outcome,subject_reference,details').order('occurred_at',{ascending:false}).limit(100);
  return error?reply({error:'Unable to load activity.'},503):reply({activity:data});
 }
 if(parts[1]==='orders')return reply({error:'Cropped order exports have not migrated yet. Use the existing owner portal.'},501);
 if(parts.length===1&&request.method==='GET'){
  const [events,requests,usage,payments,deliveries]=await Promise.all([
   client.from('gallery_events').select('*').order('event_date',{ascending:false}),
   client.from('gallery_requests').select('*').order('created_at',{ascending:false}).limit(200),
   client.rpc('gallery_storage_usage'),
   client.from('gallery_payments').select('*').order('received_at',{ascending:false}).limit(200),
   client.from('gallery_payment_events').select('received_at').order('received_at',{ascending:false}).limit(1)
  ]);
  if(events.error||requests.error||usage.error||payments.error||deliveries.error)return reply({error:'Unable to load the studio.'},503);
  return reply({events:events.data,requests:requests.data,usage:usage.data,payments:payments.data,lastPaymentDelivery:deliveries.data[0]?.received_at||null});
 }
 if(parts[1]==='events'&&parts.length===2&&request.method==='POST'){
  const b=await jsonBody(request);
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))return reply({error:'Enter an event name and date.'},400);
  const {data,error}=await client.from('gallery_events').insert({name:b.name.trim(),event_date:b.date,is_sample:false,active:false}).select('*').single();
  return error?reply({error:'Could not create event.'},400):reply({event:data},201);
 }
 if(parts[1]==='requests'&&uuid(parts[2])&&parts.length===3&&request.method==='POST'){
  const b=await jsonBody(request);
  if(!['submitted','preparing','ready','completed','cancelled'].includes(b.status))return reply({error:'Invalid status.'},400);
  const {data,error}=await client.from('gallery_requests').update({status:b.status}).eq('id',parts[2]).select('id,status').single();
  return error?reply({error:'Could not update request.'},409):reply(data);
 }
 if(parts[1]!=='events'||!uuid(parts[2]))return reply({error:'Not found.'},404);
 const {data:event}=await client.from('gallery_events').select('*').eq('id',parts[2]).maybeSingle();
 if(!event)return reply({error:'Event unavailable.'},404);
 if(parts[3]==='permanent-delete'&&parts.length===4&&['GET','POST'].includes(request.method)){
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret)return reply({error:'Permanent deletion is temporarily unavailable.'},503);
  const service=createClient(runtime.url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=request.method==='POST'?await jsonBody(request):undefined;
  return purgeEvent(event,body,service,reply);
 }
 if(parts.length===3&&request.method==='GET'){
  const [photos,invitations,grants]=await Promise.all([
   client.from('gallery_photos').select('id,filename,ready,hidden,original_bytes,preview_bytes').eq('event_id',event.id).order('position'),
   client.from('gallery_invitations').select('email,expires_at,revoked').eq('event_id',event.id).order('email'),
   client.from('gallery_access').select('user_id,expires_at,revoked').eq('event_id',event.id)
  ]);
  if(photos.error||invitations.error||grants.error)return reply({error:'Unable to load event management.'},503);
  return reply({event,photos:photos.data,invitations:invitations.data,grants:grants.data});
 }
 if(parts.length===3&&request.method==='POST'){
  const b=await jsonBody(request);
  if(b.action==='trash'||b.action==='restore'){
   if(b.action==='trash'&&b.confirmName!==event.name)return reply({error:'Type the exact gallery name to confirm.'},400);
   const deleted_at=b.action==='trash'?(event.deleted_at||new Date().toISOString()):null;
   const {data,error}=await client.from('gallery_events').update({active:false,deleted_at}).eq('id',event.id).select('id,active,deleted_at').single();
   return error?reply({error:'Could not update gallery trash status.'},409):reply({event:data});
  }
  if(event.deleted_at)return reply({error:'Restore this gallery from Trash before changing guest access.'},409);
  if(typeof b.active!=='boolean')return reply({error:'Invalid event setting.'},400);
  const {error}=await client.from('gallery_events').update({active:b.active}).eq('id',event.id);
  return error?reply({error:'Could not update event.'},409):reply({active:b.active});
 }
 if(event.deleted_at&&request.method!=='GET')return reply({error:'Restore this gallery from Trash before making changes.'},409);
 if(parts[3]==='remove-access'&&parts.length===4&&request.method==='POST'){
  const b=await jsonBody(request,4096);
  const hasEmail=typeof b.email==='string',hasUser=typeof b.userId==='string';
  if(hasEmail===hasUser||b.confirm!==true||(hasEmail&&(b.email.length>254||!/^\S+@\S+\.\S+$/.test(b.email.trim())))||(hasUser&&!uuid(b.userId)))return reply({error:'Confirm which guest should lose access.'},400);
  const {data,error}=await client.rpc('gallery_remove_guest_access',{target_event:event.id,guest_email:hasEmail?b.email.trim().toLowerCase():null,guest_user_id:hasUser?b.userId:null});
  return error?reply({error:'Could not remove access. Verify your owner session and retry.'},error.code==='42501'?403:409):reply(data);
 }
 if(parts[3]==='access'&&parts.length===4&&request.method==='POST'){
  const b=await jsonBody(request);
  if(typeof b.email!=='string'||b.email.length>254||!/^\S+@\S+\.\S+$/.test(b.email.trim())||typeof b.revoked!=='boolean'||!Number.isFinite(Date.parse(b.expiresAt)))return reply({error:'Enter a valid guest email and expiry date.'},400);
  const {error}=await client.from('gallery_invitations').upsert({event_id:event.id,email:b.email.trim().toLowerCase(),expires_at:b.expiresAt,revoked:b.revoked});
  return error?reply({error:'Could not save guest access.'},409):reply({saved:true});
 }
 if(parts[3]==='grants'&&parts.length===4&&request.method==='POST'){
  const b=await jsonBody(request);if(!uuid(b.userId)||typeof b.revoked!=='boolean')return reply({error:'Invalid access change.'},400);
  const {error}=await client.from('gallery_access').update({revoked:b.revoked}).eq('event_id',event.id).eq('user_id',b.userId);
  return error?reply({error:'Could not update access.'},409):reply({saved:true});
 }
 if(parts[3]==='upload'&&parts.length===4&&request.method==='POST'){
  const b=await jsonBody(request);
  if(typeof b.filename!=='string'||!b.filename.trim()||b.filename.length>180||!mimeExtensions[b.mime]||!Number.isSafeInteger(b.bytes)||b.bytes<1||b.bytes>15728640)return reply({error:'Use a JPEG, PNG or WebP image up to 15 MB.'},400);
  const id=randomUUID(),prefix=event.id+'/'+id;
  const record={id,event_id:event.id,filename:b.filename.trim(),sample_asset:null,original_key:prefix+'/original.'+mimeExtensions[b.mime],preview_key:prefix+'/preview.jpg',position:Math.floor(Date.now()/1000),ready:false,hidden:true};
  const {error}=await client.from('gallery_photos').insert(record);if(error)return reply({error:'Could not prepare upload.'},409);
  const [original,preview]=await Promise.all([client.storage.from('gallery-originals').createSignedUploadUrl(record.original_key),client.storage.from('gallery-previews').createSignedUploadUrl(record.preview_key)]);
  if(original.error||preview.error){
   const diagnostic=[original.error?'original '+uploadFailureCode(original.error):'',preview.error?'preview '+uploadFailureCode(preview.error):''].filter(Boolean).join('; ');
   console.error('Gallery upload signing failed:',diagnostic);
   return reply({error:'Could not prepare secure upload ('+diagnostic+'). Remove the incomplete upload and retry.'},503);
  }
  return reply({photoId:id,originalUrl:original.data.signedUrl,previewUrl:preview.data.signedUrl});
 }
 if(parts[3]==='photos'&&uuid(parts[4])){
  const {data:p}=await client.from('gallery_photos').select('*').eq('event_id',event.id).eq('id',parts[4]).maybeSingle();
  if(!p)return reply({error:'Photo unavailable.'},404);
  if(parts[5]==='preview-url'&&request.method==='GET'){
   if(!p.ready)return reply({error:'Photo unavailable.'},404);
   if(p.sample_asset&&/^photo-[1-8]\.jpg$/.test(p.sample_asset))return reply({url:'data:image/jpeg;base64,'+Buffer.from(samplePhoto(p.sample_asset)).toString('base64')});
   const {data,error}=await client.storage.from('gallery-previews').createSignedUrl(p.preview_key,60);
   return error?reply({error:'Photo unavailable.'},404):reply({url:data.signedUrl});
  }
  if(parts[5]==='preview'&&request.method==='GET'){
   if(!p.ready)return reply({error:'Photo unavailable.'},404);
   headers.set('Content-Type','image/jpeg');
   if(p.sample_asset&&/^photo-[1-8]\.jpg$/.test(p.sample_asset)){const bytes=samplePhoto(p.sample_asset);return new Response(bytes,{headers});}
   const {data,error}=await client.storage.from('gallery-previews').download(p.preview_key);
   return error?reply({error:'Photo unavailable.'},404):new Response(data,{headers});
  }
  if(parts[5]==='original'&&request.method==='GET'){
   if(!p.ready||!p.original_key)return reply({error:'No uploaded original for this photo.'},404);
   const {data,error}=await client.storage.from('gallery-originals').createSignedUrl(p.original_key,60,{download:p.filename});
   // Short-lived owner download capability avoids the buffered function size limit.
   return error?reply({error:'Original unavailable.'},404):reply({url:data.signedUrl});
  }
  if(parts.length===5&&request.method==='POST'){
   const b=await jsonBody(request);
   if(b.action==='process')return processUpload(client,p,reply);
   if(b.action==='complete'){
    if(p.ready)return reply({ready:true});
    const [a,z]=await Promise.all([client.storage.from('gallery-originals').download(p.original_key),client.storage.from('gallery-previews').download(p.preview_key)]);
    if(a.error||z.error)return reply({error:'Both files must finish uploading before this photo can be added.'},409);
    const am=actualMime(new Uint8Array(await a.data.arrayBuffer())),zm=actualMime(new Uint8Array(await z.data.arrayBuffer()));
    if(!mimeExtensions[am]||am!==a.data.type||zm!=='image/jpeg'||z.data.type!=='image/jpeg'||a.data.size>15728640||z.data.size>1048576)return reply({error:'The uploaded files are not supported images. Remove this incomplete upload.'},400);
    const {error}=await client.from('gallery_photos').update({ready:true,hidden:false,original_bytes:a.data.size,preview_bytes:z.data.size}).eq('id',p.id).eq('ready',false);
    return error?reply({error:'Unable to finalize photo.'},409):reply({ready:true});
   }
   if(b.action==='discard'&&!p.ready){
    const a=await client.storage.from('gallery-originals').remove([p.original_key]);const z=await client.storage.from('gallery-previews').remove([p.preview_key]);
    if(a.error||z.error)return reply({error:'Could not remove incomplete files. Retry.'},503);
    const {error}=await client.from('gallery_photos').delete().eq('id',p.id).eq('ready',false);
    return error?reply({error:'Could not remove incomplete upload.'},409):reply({removed:true});
   }
   if(b.action==='visibility'&&p.ready&&typeof b.hidden==='boolean'){
    const {error}=await client.from('gallery_photos').update({hidden:b.hidden}).eq('id',p.id);
    return error?reply({error:'Could not update photo.'},409):reply({saved:true});
   }
  }
 }
 return reply({error:'Not found.'},404);
}

export async function guestRoutes(request:Request,parts:string[],client:SupabaseClient,user:User,reply:Reply,headers:Headers){
 if(parts[0]!=='events')return reply({error:'Not found.'},404);
 if(parts.length===1&&request.method==='GET'){
  const {data,error}=await client.from('gallery_events').select('id,name,event_date,is_sample').eq('active',true).order('event_date',{ascending:false});
  return error?reply({error:'Unable to load galleries.'},503):reply({events:data});
 }
 if(!uuid(parts[1]))return reply({error:'Gallery unavailable.'},404);
 const {data:event}=await client.from('gallery_events').select('id,name,event_date,is_sample').eq('id',parts[1]).eq('active',true).maybeSingle();
 if(!event)return reply({error:'This gallery is unavailable. Access may have expired or been removed.'},404);
 if(parts[2]==='pricing'&&parts.length===3&&request.method==='GET')return reply({currency:'USD',packs:PACKS.map(({count,cents,variant})=>({count,cents,variant:variant.split('/').at(-1)})),enabled:runtime.checkoutEnabled&&!event.is_sample});
 if(parts[2]==='checkout'&&parts.length===3&&request.method==='POST'){
  if(!runtime.checkoutEnabled||event.is_sample)return reply({error:'Online checkout is not open for this gallery yet. You can still save or submit your selection.'},409);
  const b=await jsonBody(request);
  if(!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(b.cents))return reply({error:'Save and review your selection first.'},400);
  const {data:selection}=await client.from('gallery_selections').select('items,revision').eq('event_id',event.id).eq('user_id',user.id).maybeSingle();
  if(!selection||selection.revision!==b.revision)return reply({error:'Your selection changed. Reload it before checkout.'},409);
  try{
   const pack=packFor(selection.items,b.count);
   const visible=await client.from('gallery_photos').select('id').eq('event_id',event.id).eq('ready',true).eq('hidden',false).in('id',selection.items.map((i:{photoId:string})=>i.photoId));
   if(visible.error||visible.data?.length!==selection.items.length)return reply({error:'A selected photo is no longer available. Reload your gallery.'},409);
   await checkPrice(pack,b.cents);
   let {data:snapshot}=await client.from('gallery_requests').select('id,status').eq('event_id',event.id).eq('user_id',user.id).eq('selection_revision',b.revision).maybeSingle();
   if(!snapshot){
    const inserted=await client.from('gallery_requests').insert({event_id:event.id,user_id:user.id,selection_revision:b.revision}).select('id,status').single();
    if(inserted.error?.code==='PT429')return reply({error:"Too many new order requests. Your photos are saved. Please wait before starting another order."},429);
    snapshot=inserted.data;
    if(inserted.error?.code==='23505')({data:snapshot}=await client.from('gallery_requests').select('id,status').eq('event_id',event.id).eq('user_id',user.id).eq('selection_revision',b.revision).maybeSingle());
   }
   if(!snapshot||snapshot.status!=='submitted')return reply({error:'This selection is already being handled. Contact Atelier Elunora before ordering again.'},409);
   if(b.ninemags===true)return reply(await prepareNineMags(client,user.id,event.id,snapshot.id,pack));
   const checkoutUrl=await createCheckout(pack,snapshot.id);
   // A cart is not proof of payment. Shopify remains the payment/order source of truth.
   return reply({checkoutUrl,reference:snapshot.id});
  }catch(e){return reply({error:e instanceof Error?e.message:'Could not prepare checkout.'},409);}
 }
 if(parts.length===2&&request.method==='GET'){
  const [photos,grant,invite]=await Promise.all([
   client.from('gallery_photos').select('id,filename,original_key').eq('event_id',event.id).eq('ready',true).eq('hidden',false).order('position').order('id'),
   client.from('gallery_access').select('expires_at').eq('event_id',event.id).eq('user_id',user.id).eq('revoked',false).gt('expires_at',new Date().toISOString()).maybeSingle(),
   client.from('gallery_invitations').select('expires_at').eq('event_id',event.id).eq('email',user.email?.toLowerCase()||'').eq('revoked',false).gt('expires_at',new Date().toISOString()).maybeSingle()
  ]);
  const dates=[grant.data?.expires_at,invite.data?.expires_at].filter(Boolean).sort();
  return photos.error?reply({error:'Unable to load photos.'},503):reply({event,photos:photos.data.map(({original_key,...photo})=>({...photo,hasOriginal:!!original_key})),expiresAt:dates.at(-1)||null});
 }
 if(parts[2]==='photos'&&parts.length===5&&parts[4]==='original'&&uuid(parts[3])&&request.method==='GET'){
  return guestOriginal(client,event.id,parts[3],reply,headers,()=>{
   const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
   if(!secret)throw Error('Download service unavailable');
   return createClient(runtime.url,secret,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
  });
 }
 if(parts[2]==='photos'&&parts.length===4&&request.method==='GET'){
  const {data:p}=await client.from('gallery_photos').select('sample_asset,preview_key').eq('event_id',event.id).eq('id',parts[3]).eq('ready',true).eq('hidden',false).maybeSingle();
  if(!p)return reply({error:'Photo unavailable.'},404);
  headers.set('Content-Type','image/jpeg');
  if(p.sample_asset&&/^photo-[1-8]\.jpg$/.test(p.sample_asset)){
   const bytes=samplePhoto(p.sample_asset);return new Response(bytes,{headers});
  }
  return guestPreview(client,event.id,parts[3],reply,headers);
 }
 if(parts[2]==='selection'&&parts.length===3){
  if(request.method==='GET'){
   const {data,error}=await client.from('gallery_selections').select('items,revision,updated_at').eq('event_id',event.id).eq('user_id',user.id).maybeSingle();
   return error?reply({error:'Unable to load selection.'},503):reply(data||{items:[],revision:0});
  }
  if(request.method==='POST'){
   const b=await jsonBody(request);if(!Number.isSafeInteger(b.revision)||b.revision<0||!Array.isArray(b.items)||b.items.length>50)return reply({error:'Invalid selection.'},400);
   const update={items:b.items,revision:b.revision+1};
   const result=b.revision===0?await client.from('gallery_selections').insert({...update,event_id:event.id,user_id:user.id}).select('revision').single():await client.from('gallery_selections').update(update).eq('event_id',event.id).eq('user_id',user.id).eq('revision',b.revision).select('revision').maybeSingle();
   if(result.error||!result.data)return reply({error:'Selection changed or contains an unavailable photo. Reload before saving again.'},409);
   return reply(update);
  }
 }
 if(parts[2]==='requests'&&parts.length===3){
  if(request.method==='GET'){
   const {data,error}=await client.from('gallery_requests').select('id,items,status,created_at,selection_revision').eq('event_id',event.id).eq('user_id',user.id).order('created_at',{ascending:false});
   return error?reply({error:'Could not load requests.'},503):reply({requests:data});
  }
  if(request.method==='POST'){
   const b=await jsonBody(request);if(!Number.isSafeInteger(b.revision)||b.revision<1)return reply({error:'Save your selection first.'},400);
   const {data:prior}=await client.from('gallery_requests').select('id,status').eq('event_id',event.id).eq('user_id',user.id).eq('selection_revision',b.revision).maybeSingle();
   if(prior)return reply(prior);
   const {data,error}=await client.from('gallery_requests').insert({event_id:event.id,user_id:user.id,selection_revision:b.revision}).select('id,status').single();
   if(error?.code==='PT429')return reply({error:"Too many new order requests. Your photos are saved. Please wait before starting another order."},429);
   if(error?.code==='23505'){
    const {data:existing}=await client.from('gallery_requests').select('id,status').eq('event_id',event.id).eq('user_id',user.id).eq('selection_revision',b.revision).maybeSingle();if(existing)return reply(existing);
   }
   return error?reply({error:'Could not submit. Reload and save a current, nonempty selection before trying again.'},409):reply(data,201);
  }
 }
 return reply({error:'Not found.'},404);
}



