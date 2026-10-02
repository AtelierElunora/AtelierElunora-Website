// Byte-preserving original download, never a signing endpoint or arbitrary key proxy.
export async function guestOriginal(client, eventId, photoId, reply, headers, storageFactory) {
 if(!/^[0-9a-f-]{36}$/i.test(eventId)||!/^[0-9a-f-]{36}$/i.test(photoId))return reply({error:'Photo unavailable.'},404);
 const lookup=()=>client.from('gallery_photos').select('original_key,filename,original_bytes').eq('event_id',eventId).eq('id',photoId).eq('ready',true).eq('hidden',false).maybeSingle();
 const initial=await lookup();
 if(initial.error)return reply({error:'Unable to verify photo access.'},503);
 const photo=initial.data,key=photo?.original_key;
 if(typeof key!=='string'||!key.startsWith(eventId+'/'+photoId+'/')||key.includes('..')||!/^.+\/original\.(jpg|png|webp)$/.test(key))return reply({error:'Original unavailable.'},404);
 if(!Number.isSafeInteger(photo.original_bytes)||photo.original_bytes<1||photo.original_bytes>25*1024*1024)return reply({error:'Use gallery tools for this download.'},413);
 let result;
 try {result=await storageFactory().from('gallery-originals').download(key);}catch{return reply({error:'Original unavailable.'},503);}
 if(result.error||!result.data||result.data.size>25*1024*1024)return reply({error:'Original unavailable.'},503);
 const [current,event,session]=await Promise.all([
  lookup(),client.from('gallery_events').select('id').eq('id',eventId).eq('active',true).maybeSingle(),client.rpc('gallery_session_active')
 ]);
 if(session.error||session.data!==true)return reply({error:'Sign in again.'},401);
 if(current.error||event.error)return reply({error:'Unable to verify photo access.'},503);
 if(current.data?.original_key!==key||!event.data)return reply({error:'Original unavailable.'},404);
 const out=new Headers(headers);
 out.set('Content-Type',key.endsWith('.png')?'image/png':key.endsWith('.webp')?'image/webp':'image/jpeg');
 out.set('Cache-Control','private, no-store');out.set('X-Content-Type-Options','nosniff');
 const filename=String(photo.filename||'photo.jpg').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)||'photo.jpg';
 out.set('Content-Disposition',`attachment; filename="${filename}"`);
 return new Response(result.data,{headers:out});
}
