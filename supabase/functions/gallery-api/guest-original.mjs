export async function guestOriginal(client, eventId, photoId, reply, headers, storageFactory) {
 const lookup = () => client.from('gallery_photos').select('original_key').eq('event_id', eventId).eq('id', photoId).eq('ready', true).eq('hidden', false).maybeSingle();
 const initial = await lookup();
 if (initial.error) return reply({error:'Unable to verify photo access. Please retry.'},503);
 const key = initial.data?.original_key;
 if (typeof key !== 'string' || !key.startsWith(eventId+'/'+photoId+'/') || key.includes('..')) return reply({error:'Original photo unavailable.'},404);
 let result;
 try { result = await storageFactory().from('gallery-originals').download(key); }
 catch { return reply({error:'Unable to download original. Please retry.'},503); }
 if (result.error || !result.data) return reply({error:'Unable to download original. Please retry.'},503);
 const current = await lookup();
 if (current.error) return reply({error:'Unable to verify photo access. Please retry.'},503);
 if (current.data?.original_key !== key) return reply({error:'Photo unavailable.'},404);
 const out = new Headers(headers);
 out.set('Content-Type','application/octet-stream');
 out.set('Cache-Control','private, no-store');
 out.set('X-Content-Type-Options','nosniff');
 return new Response(result.data,{headers:out});
}
