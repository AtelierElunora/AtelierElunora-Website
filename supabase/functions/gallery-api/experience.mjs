import {hash,uuid} from './station.mjs';
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const tokenValid=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const checked=r=>{if(r.error)throw Object.assign(Error('Unable to complete this request.'),{code:r.error.code});return r.data;};
const settings=e=>({welcome:e.welcome,moderation:e.moderation,downloads:e.downloads,guestLimit:e.guest_limit,closesAt:e.closes_at});
export async function experienceRequest(body,service,reply,render,user=null){
 try{
  if(body.action==='studio'){
   if(!user)return reply({error:'Sign in to create your private photo workspace.'},401);
   const link=randomToken();const eventId=checked(await service.rpc('gallery_studio_open',{p_user:user.id,p_link:await hash(link)}));
   return reply({link,eventId});
  }
  if(body.action==='info'||body.action==='join'){
   if(!tokenValid(body.link))return reply({error:'Open the event QR link.'},403);
   const e=checked(await service.from('gallery_experiences').select('*').eq('token_hash',await hash(body.link)).maybeSingle());
   if(!e||!e.enabled||Date.parse(e.closes_at)<=Date.now()||(e.studio_user&&e.studio_user!==user?.id))return reply({error:'This event link is unavailable.'},403);
   const event=checked(await service.from('gallery_events').select('id,name,active,deleted_at,purge_started_at').eq('id',e.event_id).single());
   if(!event.active||event.deleted_at||event.purge_started_at)return reply({error:'This event has closed.'},403);
   if(e.upload_later){const row=checked(await service.from('gallery_order_uploads').select('id').eq('event_id',e.event_id).single());checked(await service.rpc('gallery_later_check',{p_id:row.id}));}
   if(body.action==='info')return reply({name:event.name,eventId:event.id,...settings(e),studio:Boolean(e.studio_user),uploadLater:e.upload_later===true});
   if(body.consent!==true||!tokenValid(body.session))return reply({error:'Accept the photo-sharing notice before uploading.'},400);
   checked(await service.rpc('gallery_experience_session',{p_link:await hash(body.link),p_token:await hash(body.session),p_user:user?.id??null}));
   return reply({joined:true,eventId:event.id});
  }
  if(!tokenValid(body.session))return reply({error:'Open the event link again.'},403);
  const digest=await hash(body.session);
  const s=checked(await service.rpc('gallery_experience_check',{p_token:digest}));
  const e=checked(await service.from('gallery_experiences').select('*').eq('event_id',s.event_id).single());
  if(e.studio_user&&e.studio_user!==user?.id)return reply({error:'Sign in to your photo workspace.'},401);
  if(e.upload_later){const row=checked(await service.from('gallery_order_uploads').select('id').eq('event_id',s.event_id).single());const order=checked(await service.rpc('gallery_later_check',{p_id:row.id}));if(['reserve','finish'].includes(body.action)&&order.status!=='awaiting_photos')return reply({error:'Your photos are submitted. Contact Atelier Elunora for changes.'},409);}
  if(body.action==='reserve'){
   if(!uuid(body.requestId)||typeof body.filename!=='string'||!body.filename.trim()||body.filename.length>180||!['image/jpeg','image/png','image/webp'].includes(body.mime)||!Number.isSafeInteger(body.bytes)||body.bytes<1||body.bytes>15728640)return reply({error:'Choose JPEG, PNG or WebP photos up to 15 MB each.'},400);
   const p=checked(await service.rpc('gallery_guest_reserve',{p_token:digest,p_request:body.requestId,p_filename:body.filename,p_mime:body.mime,p_bytes:body.bytes}));
   if(p.ready)return reply({photoId:p.id,ready:true});
   const signed=checked(await service.storage.from('gallery-originals').createSignedUploadUrl(p.original_key));
   return reply({photoId:p.id,uploadUrl:signed.signedUrl});
  }
  if(body.action==='finish'){
   if(!uuid(body.requestId))return reply({error:'Invalid upload.'},400);
   const receipt=checked(await service.from('gallery_guest_uploads').select('*').eq('session_id',s.id).eq('request_id',body.requestId).single());
   if(receipt.status!=='uploading')return reply({status:receipt.status});
   const p=checked(await service.from('gallery_photos').select('*').eq('id',receipt.photo_id).eq('event_id',s.event_id).single());
   const original=checked(await service.storage.from('gallery-originals').download(p.original_key));
   if(original.size!==receipt.bytes||original.type!==receipt.mime)return reply({error:'The uploaded file does not match. Choose the original photo again.'},422);
   let preview;
   try{preview=await render(new Uint8Array(await original.arrayBuffer()));}catch{return reply({error:'This image could not be processed. Try a smaller JPEG copy.'},422);}
   if(preview.length<4||preview.length>1048576||preview[0]!==255||preview[1]!==216)return reply({error:'Could not create a preview.'},422);
   const bucket=service.storage.from('gallery-previews');
   const saved=await bucket.upload(p.preview_key,preview,{contentType:'image/jpeg',upsert:false});
   if(saved.error){const prior=checked(await bucket.download(p.preview_key));if(await hash(new Uint8Array(await prior.arrayBuffer()))!==await hash(preview))throw Error('Preview conflict');}
   const status=checked(await service.rpc('gallery_guest_finish',{p_token:digest,p_request:body.requestId,p_preview_bytes:preview.length}));
   return reply({status,photoId:p.id});
  }
  if(body.action==='photos'){
  const cursor=body.cursor??0;if(!Number.isSafeInteger(cursor)||cursor<0||cursor>20000)return reply({error:'Invalid gallery page.'},400);
   let query=service.from('gallery_photos').select('id,filename,preview_key'+((e.studio_user||e.upload_later)?'':',gallery_guest_uploads!inner(session_id,status)')).eq('event_id',s.event_id).eq('ready',true);
   query=(e.studio_user||e.upload_later)?query.eq('hidden',false):query.eq('gallery_guest_uploads.session_id',s.id).in('gallery_guest_uploads.status',['pending','approved']);
   const photos=checked(await query.order('position').order('id').range(cursor,cursor+49));
   const signed=photos.length?checked(await service.storage.from('gallery-previews').createSignedUrls(photos.map(p=>p.preview_key),300)):[];
   return reply({photos:photos.map(p=>({id:p.id,filename:p.filename,status:(Array.isArray(p.gallery_guest_uploads)?p.gallery_guest_uploads[0]:p.gallery_guest_uploads)?.status??null,url:signed.find(x=>x.path===p.preview_key)?.signedUrl})),next:photos.length===50?cursor+50:null,downloads:e.downloads});
  }
  if(body.action==='downloads'){
   if(!e.downloads)return reply({error:'Downloads are disabled for this event.'},403);
   if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>30||!body.ids.every(uuid)||new Set(body.ids).size!==body.ids.length)return reply({error:'Select up to 30 photos at a time.'},400);
   let query=service.from('gallery_photos').select('id,filename,original_key,original_bytes'+((e.studio_user||e.upload_later)?'':',gallery_guest_uploads!inner(session_id,status)')).eq('event_id',s.event_id).eq('ready',true).in('id',body.ids);
   query=(e.studio_user||e.upload_later)?query.eq('hidden',false):query.eq('gallery_guest_uploads.session_id',s.id).in('gallery_guest_uploads.status',['pending','approved']);
   const photos=checked(await query);
   if(photos.length!==body.ids.length)return reply({error:'A selected photo is no longer available.'},409);
   if(photos.reduce((n,p)=>n+p.original_bytes,0)>100*1024*1024)return reply({error:'Choose fewer photos per download (100 MB maximum).'},400);
   const signed=checked(await service.storage.from('gallery-originals').createSignedUrls(photos.map(p=>p.original_key),120));
   return reply({photos:photos.map(p=>({id:p.id,filename:p.filename,url:signed.find(x=>x.path===p.original_key)?.signedUrl}))});
  }
  // Event QR possession must never grant whole-gallery access.
  if(body.action==='claim'){
   if(!e.studio_user)return reply({error:'Whole-gallery access is available only by invitation from the host.'},403);
   if(!user)return reply({error:'Sign in before ordering magnets.'},401);
   checked(await service.from('gallery_access').upsert({event_id:s.event_id,user_id:user.id,expires_at:e.closes_at,revoked:false},{onConflict:'event_id,user_id'}));
   checked(await service.from('gallery_guest_sessions').update({user_id:user.id}).eq('id',s.id));
   return reply({eventId:s.event_id});
  }
  return reply({error:'Not found.'},404);
 }catch(err){return reply({error:err.code==='PT429'?'The photo limit has been reached. Ask your host.':err.code==='PT403'?'This event link has closed or changed.':err.code==='PT409'?'This upload changed. Select the same file and retry.':'Could not complete this request. Please retry.'},err.code==='PT429'?429:err.code==='PT403'?403:err.code==='PT409'?409:503);}
}

export async function ownerExperience(eventId,body,service,reply){
 const qrUrl=token=>token?'https://www.atelierelunora.com/pages/share-photos#event='+token:null;
 if(body.action==='restore-qr'){
  let token;try{const url=new URL(body.url);if(url.origin!=='https://www.atelierelunora.com')throw Error();token=new URLSearchParams(url.hash.slice(1)).get('event');}catch{return reply({error:'Paste the original event upload link.'},400);}
  if(!tokenValid(token))return reply({error:'Paste the original event upload link.'},400);
  const current=checked(await service.from('gallery_experiences').select('*').eq('event_id',eventId).maybeSingle());
  if(!current||current.studio_user||current.upload_later||await hash(token)!==current.token_hash)return reply({error:'This link does not match this event’s current QR code.'},409);
  const saved=checked(await service.from('gallery_experiences').update({qr_token:token}).eq('event_id',eventId).eq('token_hash',current.token_hash).select('event_id').maybeSingle());
  return saved?reply({saved:true,url:qrUrl(token)}):reply({error:'The QR link changed. Refresh and try again.'},409);
 }
 if(body.action==='save'){
  const {welcome,closesAt,guestLimit,eventLimit,enabled,moderation,downloads}=body;
  if(typeof welcome!=='string'||welcome.length>500||!Number.isFinite(Date.parse(closesAt))||Date.parse(closesAt)<=Date.now()||!Number.isInteger(guestLimit)||guestLimit<1||guestLimit>200||!Number.isInteger(eventLimit)||eventLimit<1||eventLimit>20000||![enabled,moderation,downloads].every(x=>typeof x==='boolean'))return reply({error:'Check the welcome message, closing date and photo limits.'},400);
  const current=checked(await service.from('gallery_experiences').select('*').eq('event_id',eventId).maybeSingle());
  if(current?.studio_user||current?.upload_later)return reply({error:'Customer workspaces are managed through the online uploader.'},409);
  const link=(!current||body.rotate===true)?randomToken():current.qr_token??null;
  const values={event_id:eventId,token_hash:link?await hash(link):current.token_hash,qr_token:link,welcome,closes_at:new Date(closesAt).toISOString(),guest_limit:guestLimit,event_limit:eventLimit,enabled,moderation,downloads};
  if(current){const saved=checked(await service.from('gallery_experiences').update(values).eq('event_id',eventId).eq('token_hash',current.token_hash).select('event_id').maybeSingle());if(!saved)return reply({error:'The QR link changed. Refresh and try again.'},409);}
  else checked(await service.from('gallery_experiences').insert(values));
  return reply({saved:true,url:qrUrl(link)});
 }
 if(body.action==='delete'&&uuid(body.photoId)){
  if(body.confirm!==true)return reply({error:'Confirm permanent deletion of this rejected photo.'},400);
  const begun=await service.rpc('gallery_guest_delete_begin',{p_event:eventId,p_photo:body.photoId});
  if(begun.error)return reply({error:'Only rejected photos without print jobs or orders can be deleted.'},409);
  for(const [bucket,key] of [['gallery-originals',begun.data.original_key],['gallery-previews',begun.data.preview_key]]){
   if(key){const removed=await service.storage.from(bucket).remove([key]);if(removed.error)return reply({error:'Some files could not be deleted. Retry deletion to finish cleanup.'},503);}
  }
  const removed=await service.from('gallery_photos').delete().eq('event_id',eventId).eq('id',body.photoId).eq('ready',false);
  return removed.error?reply({error:'Files removed. Retry to finish removing the photo record.'},503):reply({deleted:true});
 }
 if(['approve','reject','print'].includes(body.action)&&uuid(body.photoId)){
  if(body.action==='print'&&!uuid(body.requestId))return reply({error:'Refresh the dashboard before queueing another magnet.'},400);
  const r=body.action==='print'?await service.rpc('gallery_guest_queue',{p_event:eventId,p_photo:body.photoId,p_request:body.requestId}):await service.rpc('gallery_guest_review',{p_event:eventId,p_photo:body.photoId,p_action:body.action});
  return r.error?reply({error:'Could not update the photo. Approve it before printing, and resolve any reserved print first.'},409):reply({saved:true});
 }
 if(body.action==='list'){
  const review=body.status??'pending';if(!['pending','approved','rejected'].includes(review))return reply({error:'Invalid review view.'},400);
  const stored=checked(await service.from('gallery_experiences').select('enabled,closes_at,welcome,moderation,downloads,guest_limit,event_limit,reserved,studio_user,upload_later,qr_token').eq('event_id',eventId).maybeSingle());
  const {qr_token,...config}=stored??{};
  const url=stored&&!stored.studio_user&&!stored.upload_later?qrUrl(qr_token):null;
  const cursor=body.cursor??0;if(!Number.isSafeInteger(cursor)||cursor<0||cursor>20000)return reply({error:'Invalid page.'},400);
  const rows=checked(await service.from('gallery_guest_uploads').select('photo_id,status,gallery_photos!inner(event_id,filename,preview_key)').eq('gallery_photos.event_id',eventId).in('status',review==='rejected'?['rejected','deleting']:[review]).order('photo_id').range(cursor,cursor+49));
  const urls=rows.length?checked(await service.storage.from('gallery-previews').createSignedUrls(rows.map(r=>r.gallery_photos.preview_key),300)):[];
  return reply({config:stored?config:null,url,qrNeedsRestore:Boolean(stored&&!stored.studio_user&&!stored.upload_later&&!qr_token),photos:rows.map(r=>({id:r.photo_id,status:r.status,filename:r.gallery_photos.filename,url:urls.find(u=>u.path===r.gallery_photos.preview_key)?.signedUrl})),next:rows.length===50?cursor+50:null});
 }
 return reply({error:'Not found.'},404);
}
