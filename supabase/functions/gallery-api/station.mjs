import {normalizeTemplate} from './magnet-template.mjs';
// No owner JWTs on guest devices. Capabilities are random, hashed, scoped and expiring.
export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');
const fail=(reply,error)=>reply({error:({'PT403':'Station expired, closed or unavailable. Ask the attendant.','PT409':'This request changed. Refresh the print queue or retry the same photo.','PT429':'Please wait a few seconds. This station may have reached its capture limit.'})[error?.code]||'Unable to complete this request. Retry or ask the attendant.'},({'PT403':403,'PT409':409,'PT429':429})[error?.code]||503);
export async function ownerStation(request,parts,client,service,actor,body,reply){
 const eventId=parts[2]; if(!uuid(eventId)||parts.length!==3)return reply({error:'Not found.'},404);
 const {data:event,error}=await client.from('gallery_events').select('id,name,deleted_at,purge_started_at').eq('id',eventId).maybeSingle();
 if(error||!event||event.deleted_at||event.purge_started_at)return reply({error:'Event unavailable.'},404);
 if(body.action==='template'&&request.method==='POST'){
  let template;try{template=normalizeTemplate(body.template);}catch(e){return reply({error:e.message},400);}
  const saved=await service.from('gallery_magnet_templates').upsert({event_id:eventId,template,updated_at:new Date().toISOString()},{onConflict:'event_id'});
  return saved.error?fail(reply,saved.error):reply({template});
 }
 if(request.method==='GET'){
  const saved=await service.from('gallery_magnet_templates').select('template').eq('event_id',eventId).maybeSingle();
  if(saved.error)return fail(reply,saved.error);
  const statuses=['pending','printing','held','printed'];
  const [stations,jobs,...totals]=await Promise.all([service.from('gallery_stations').select('id,purpose,expires_at,revoked,submitted').eq('event_id',eventId).eq('revoked',false).gt('expires_at',new Date().toISOString()),service.from('gallery_print_jobs').select('id,status,quantity,created_at').eq('event_id',eventId).neq('status','printed').order('created_at').order('id').limit(100),...statuses.map(status=>service.from('gallery_print_jobs').select('id',{count:'exact',head:true}).eq('event_id',eventId).eq('status',status))]);
  return stations.error||jobs.error||totals.some(t=>t.error||!Number.isInteger(t.count))?reply({error:'Could not load station status.'},503):reply({stations:stations.data,jobs:jobs.data,counts:Object.fromEntries(statuses.map((status,i)=>[status,totals[i].count])),template:saved.data?.template??normalizeTemplate()});
 }
 if(body.action==='revoke'&&uuid(body.id)){
  const r=await service.from('gallery_stations').update({revoked:true}).eq('id',body.id).eq('event_id',eventId);
  return r.error?fail(reply,r.error):reply({revoked:true});
 }
 if(body.action!=='create'||!['capture','print'].includes(body.purpose))return reply({error:'Invalid station action.'},400);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const expires_at=new Date(Date.now()+12*3600000).toISOString();
 const r=await service.from('gallery_stations').insert({event_id:eventId,actor_id:actor,token_hash:await hash(token),purpose:body.purpose,expires_at}).select('id').single();
 return r.error?fail(reply,r.error):reply({id:r.data.id,expiresAt:expires_at,url:'https://www.atelierelunora.com/pages/photo-station#'+body.purpose+'='+token});
}
async function immutableUpload(service,bucket,key,bytes){
 const r=await service.storage.from(bucket).upload(key,bytes,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
 if(!r.error)return;
 // A lost response or concurrent retry can leave the exact same immutable object.
 const old=await service.storage.from(bucket).download(key);
 if(old.error||!old.data||await hash(new Uint8Array(await old.data.arrayBuffer()))!==await hash(bytes))throw Error('Upload failed');
}
export async function stationRequest(body,service,reply,render){
 if(typeof body.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token))return reply({error:'Open a valid station link from the owner app.'},403);
 const purpose=body.purpose;
 if(!['capture','print'].includes(purpose))return reply({error:'Invalid station.'},400);
 const digest=await hash(body.token);
 const checked=await service.rpc('gallery_station_check',{p_hash:digest,p_purpose:purpose});
 if(checked.error||!checked.data)return fail(reply,checked.error||{code:'PT403'});
 const station=checked.data;
 const event=await service.from('gallery_events').select('name').eq('id',station.event_id).single();
 if(event.error)return fail(reply,event.error);
 if(body.action==='info')return reply({name:event.data.name,purpose,expiresAt:station.expires_at});
 if(purpose==='capture'){
  if(body.action!=='submit'||!uuid(body.requestId)||typeof body.jpeg!=='string'||body.jpeg.length>5592408||! /^[A-Za-z0-9+/]+={0,2}$/.test(body.jpeg))return reply({error:'Use a JPEG photo up to 4 MB.'},400);
  const bytes=Uint8Array.from(atob(body.jpeg),c=>c.charCodeAt(0));
  if(bytes.length>4194304||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return reply({error:'Use a JPEG photo up to 4 MB.'},400);
  const reservation=await service.rpc('gallery_capture_reserve',{p_hash:digest,p_request:body.requestId,p_digest:await hash(bytes)});
  if(reservation.error)return fail(reply,reservation.error);
  const photo=reservation.data;
  if(photo.ready)return reply({received:true,photoId:photo.id});
  let preview;
  try{preview=await render(bytes);}catch{return reply({error:'Could not process the photo. Retake it or ask the attendant.'},422);}
  try{await immutableUpload(service,'gallery-originals',photo.original_key,bytes);await immutableUpload(service,'gallery-previews',photo.preview_key,preview);}catch{return reply({error:'Upload interrupted. Keep this screen open and retry this photo.'},503);}
  const done=await service.rpc('gallery_capture_finish',{p_hash:digest,p_request:body.requestId,p_original_bytes:bytes.length,p_preview_bytes:preview.length});
  return done.error?fail(reply,done.error):reply({received:true,photoId:done.data});
 }
 if(body.action==='batch-status'){
  const r=await service.from('gallery_print_jobs').select('id,status,quantity,x,y,zoom,version,created_at,template,letter_batch_id,letter_slot').eq('event_id',station.event_id).eq('status','printing').not('letter_batch_id','is',null).order('letter_slot').limit(6);
  return r.error?fail(reply,r.error):reply({batch:r.data.length?{id:r.data[0].letter_batch_id,jobs:r.data,created:false}:null});
 }
 if(body.action==='batch-claim'&&uuid(body.requestId)&&typeof body.partial==='boolean'){
  const saved=await service.from('gallery_magnet_templates').select('template').eq('event_id',station.event_id).maybeSingle();
  if(saved.error)return fail(reply,saved.error);
  let template;try{template=normalizeTemplate(saved.data?.template??{});}catch{return reply({error:'Correct the saved event template before using automatic printing.'},400);}
  const r=await service.rpc('gallery_letter_claim',{p_hash:digest,p_request:body.requestId,p_template:template,p_partial:body.partial});
  if(r.error?.code==='PT422')return reply({error:'Six-up letter printing needs a cut size of 3.6 inches or less. Update the event template or use single-photo printing; 3.75 inches will not fit.'},422);
  return r.error?fail(reply,r.error):reply(r.data);
 }
 if(body.action==='batch-finish'&&uuid(body.id)&&['printed','release'].includes(body.operation)){
  const r=await service.rpc('gallery_letter_finish',{p_hash:digest,p_batch:body.id,p_action:body.operation});
  return r.error?fail(reply,r.error):reply(r.data);
 }
 if(body.action==='template'){
  const saved=await service.from('gallery_magnet_templates').select('template').eq('event_id',station.event_id).maybeSingle();
  return saved.error?fail(reply,saved.error):reply({template:saved.data?.template??normalizeTemplate()});
 }
 if(body.action==='job-status'&&uuid(body.id)){
  const r=await service.from('gallery_print_jobs').select('id,status,version').eq('event_id',station.event_id).eq('id',body.id).maybeSingle();
  return r.error?fail(reply,r.error):reply({job:r.data});
 }
 if(body.action==='queue'){
  if(!['pending','printing','held'].includes(body.status))return reply({error:'Invalid queue status.'},400);
  const r=await service.from('gallery_print_jobs').select('id,status,quantity,x,y,zoom,version,created_at,template,letter_batch_id,letter_slot').eq('event_id',station.event_id).eq('status',body.status).order('created_at').order('id').limit(100);
  return r.error?fail(reply,r.error):reply({jobs:r.data});
 }
 if(body.action==='image'&&uuid(body.id)){
  const p=await service.from('gallery_print_jobs').select('id').eq('event_id',station.event_id).eq('id',body.id).maybeSingle();
  if(p.error||!p.data)return reply({error:'Photo unavailable.'},404);
  const photo=await service.from('gallery_photos').select('original_key,ready,hidden').eq('id',body.id).eq('event_id',station.event_id).single();
  if(photo.error||!photo.data.ready||photo.data.hidden)return reply({error:'Photo hidden or unavailable.'},404);
  const signed=await service.storage.from('gallery-originals').createSignedUrl(photo.data.original_key,60);
  return signed.error?fail(reply,signed.error):reply({url:signed.data.signedUrl});
 }
 if(body.action==='update'&&uuid(body.id)&&Number.isSafeInteger(body.version)&&['claim','printed','retry','hold'].includes(body.operation)){
  const quantity=body.quantity??1,x=body.x??50,y=body.y??50,zoom=body.zoom??1;
  if(!Number.isFinite(zoom)||zoom<1||zoom>3||!Number.isInteger(quantity)||quantity<1||quantity>12||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)return reply({error:'Invalid crop or quantity.'},400);
  let template=null;if(body.template!==undefined){try{template=normalizeTemplate(body.template);}catch(e){return reply({error:e.message},400);}}
  const r=await service.rpc('gallery_print_update',{p_hash:digest,p_id:body.id,p_version:body.version,p_action:body.operation,p_quantity:quantity,p_x:x,p_y:y,p_zoom:zoom,p_template:template});
  return r.error?fail(reply,r.error):reply({job:r.data});
 }
 return reply({error:'Not found.'},404);
}
