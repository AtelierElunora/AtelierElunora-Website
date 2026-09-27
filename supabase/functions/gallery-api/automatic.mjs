import {hash,uuid} from './station.mjs';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const valid=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const checked=r=>{if(r.error)throw Object.assign(Error(r.error.message||'Print helper unavailable'),{code:r.error.code});return r.data;};
export async function ownerAutomatic(eventId,actor,body,service,reply){
 if(body.action==='pair'){
  const code=random(),stationToken=random(),expiresAt=new Date(Date.now()+12*3600000).toISOString();
  const station=checked(await service.from('gallery_stations').insert({event_id:eventId,actor_id:actor,purpose:'print',helper_only:true,token_hash:await hash(stationToken),expires_at:expiresAt}).select('id').single());
  const helper=checked(await service.from('gallery_print_helpers').insert({event_id:eventId,station_id:station.id,pair_hash:await hash(code),pair_expires_at:new Date(Date.now()+5*60000).toISOString()}).select('id').single());
  return reply({helperId:helper.id,code,expiresAt:new Date(Date.now()+5*60000).toISOString()});
 }
 if(body.action==='status'){
  const helpers=checked(await service.from('gallery_print_helpers').select('id,paired,mode,partial_seconds,heartbeat_at,printer,attention,created_at,gallery_stations(expires_at,revoked)').eq('event_id',eventId).order('created_at',{ascending:false}).limit(20));
  const runs=helpers.length?checked(await service.from('gallery_helper_runs').select('id,helper_id,state,lease_until,created_at,gallery_helper_sheets(id,sheet_index,state,spooler_job,error,items,updated_at)').in('helper_id',helpers.map(h=>h.id)).order('created_at',{ascending:false}).limit(30)):[];
  const waiting=checked(await service.from('gallery_print_jobs').select('id,source_photo_id,quantity').eq('event_id',eventId).eq('status','pending').limit(2000));
  return reply({helpers,runs,waiting:{jobs:waiting.length,copies:waiting.reduce((n,j)=>n+j.quantity,0),uniquePhotos:new Set(waiting.map(j=>j.source_photo_id)).size,capped:waiting.length===2000}});
 }
 if(!uuid(body.helperId)||!['start','pause','flush','end','revoke','settings','resolve','confirm-sheet','reprint'].includes(body.action))return reply({error:'Invalid helper control.'},400);
 if(body.action==='reprint'&&(!uuid(body.requestId)||!uuid(body.sheetId)||(body.jobIds!==undefined&&(!Array.isArray(body.jobIds)||!body.jobIds.length||body.jobIds.length>6||!body.jobIds.every(uuid)))))return reply({error:'Choose the event photos to reprint.'},400);
 return reply(checked(await service.rpc('gallery_helper_control',{p_event:eventId,p_action:body.action,p_body:body})));
}
export async function automaticRequest(body,service,reply,{nativeEnabled=false,simulationEnabled=false}={}){
 try{
  if(!valid(body.token))return reply({error:'Pair the print helper first.'},403);
  const digest=await hash(body.token);
  if(body.action==='pair'){
   if(!valid(body.code))return reply({error:'Use the pairing code from the owner dashboard.'},400);
   return reply({helperId:checked(await service.rpc('gallery_helper_pair',{p_code:await hash(body.code),p_token:digest}))});
  }
  const st=checked(await service.rpc('gallery_station_check',{p_hash:digest,p_purpose:'print'}));
  const helper=checked(await service.from('gallery_print_helpers').select('id,paired,mode').eq('station_id',st.id).maybeSingle());
  if(!helper?.paired)return reply({error:'Helper pairing unavailable.'},403);
  if(body.action==='fault'){
   checked(await service.from('gallery_print_helpers').update({mode:'paused',attention:'Local helper needs attention. Inspect its saved sheet and printer queue before restarting.'}).eq('id',helper.id));return reply({paused:true});
  }
  if(body.action==='configure'){
   const p=body.profile;
   if(!p||!['ds820-8x12','letter-four','photo-4x6-single'].includes(p.id)||!['simulation','cups','windows'].includes(p.adapter)||typeof p.printer!=='string'||!p.printer||typeof p.media!=='string'||!p.media||!valid(p.fingerprint)||p.calibrated!==true||p.jobMonitoring!==true)return reply({error:'Select and calibrate a supported paper profile with job monitoring.'},400);
   if(p.adapter!=='simulation'&&!nativeEnabled)return reply({error:'Native automatic printing is awaiting hardware acceptance. Manual printing remains available.'},409);
   if(p.adapter==='simulation'&&!simulationEnabled)return reply({error:'Simulation is enabled only on an isolated test backend.'},409);
   if(helper.mode!=='paused')return reply({error:'Pause before changing printer settings.'},409);
   const active=checked(await service.from('gallery_helper_runs').select('id').eq('helper_id',helper.id).eq('state','active').maybeSingle());if(active)return reply({error:'Resolve the reserved run before changing printer settings.'},409);
   checked(await service.from('gallery_print_helpers').update({printer:{id:p.id,adapter:p.adapter,printer:p.printer.slice(0,100),media:p.media.slice(0,100),fingerprint:p.fingerprint,calibrated:true,jobMonitoring:true}}).eq('id',helper.id));return reply({configured:true});
  }
  if(body.action==='image'){
   if(!uuid(body.runId)||!uuid(body.sheetId)||!uuid(body.jobId))return reply({error:'Invalid image request'},400);
   const run=checked(await service.from('gallery_helper_runs').select('id').eq('id',body.runId).eq('helper_id',helper.id).eq('state','active').maybeSingle());
   const sheet=run&&checked(await service.from('gallery_helper_sheets').select('items').eq('id',body.sheetId).eq('run_id',run.id).maybeSingle());
   const job=sheet?.items.find(j=>j.id===body.jobId);if(!job)return reply({error:'Photo is not in this reservation.'},403);
   const photo=checked(await service.from('gallery_photos').select('original_key').eq('event_id',st.event_id).eq('id',job.source_photo_id).eq('ready',true).eq('hidden',false).single());
   return reply({url:checked(await service.storage.from('gallery-originals').createSignedUrl(photo.original_key,120)).signedUrl});
  }
  if(!['heartbeat','claim','renew','submit','report'].includes(body.action))return reply({error:'Unknown helper action.'},400);
  if(body.action==='submit'){const config=checked(await service.from('gallery_print_helpers').select('printer').eq('id',helper.id).single());if(config.printer?.adapter==='simulation'?!simulationEnabled:!nativeEnabled)return reply({error:'Printer mode is not enabled on this backend.'},409);}
  const result=checked(await service.rpc('gallery_helper_step',{p_hash:digest,p_action:body.action,p_body:body}));
  if(body.action==='claim'&&result.runId){const event=checked(await service.from('gallery_events').select('name').eq('id',st.event_id).single());result.eventName=event.name;}
  return reply(result);
 }catch(e){return reply({error:e.message},e.code==='PT403'?403:e.code==='PT409'?409:503);}
}
