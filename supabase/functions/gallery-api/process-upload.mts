import type {SupabaseClient} from '@supabase/supabase-js';
type Photo={id:string,ready:boolean,original_key:string,preview_key:string};
type Renderer=(bytes:Uint8Array)=>Promise<Uint8Array>;
type Reply=(body:unknown,status?:number)=>Response;
const render:Renderer=async bytes=>{const {makeServerPreview}=await import('./server-preview.mts');return makeServerPreview(bytes);};
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).join(',');
export async function processUpload(client:SupabaseClient,photo:Photo,reply:Reply,renderer:Renderer=render){
 const owner=await client.from('gallery_admins').select('user_id').maybeSingle();
 if(owner.error||!owner.data)return reply({error:'Owner access required.'},403);
 if(photo.ready)return reply({ready:true});
 const original=await client.storage.from('gallery-originals').download(photo.original_key);
 if(original.error||!original.data)return reply({error:'The original must finish uploading before its preview can be created.'},409);
 if(!original.data.size||original.data.size>15728640||!['image/jpeg','image/png','image/webp'].includes(original.data.type))return reply({error:'Use a JPEG, PNG or WebP image up to 15 MB.'},400);
 let preview:Uint8Array;
 try{preview=await renderer(new Uint8Array(await original.data.arrayBuffer()));}
 catch(e){return reply({error:e instanceof Error&&/^(Use a |Image dimensions|For large |Preview exceeds)/.test(e.message)?e.message:'Could not process this image. Try a smaller JPEG copy; the incomplete upload remains private.'},422);}
 if(preview[0]!==255||preview[1]!==216||preview.length>1048576||preview.length<4)return reply({error:'Could not generate a valid preview.'},422);
 const bucket=client.storage.from('gallery-previews');
 const upload=await bucket.upload(photo.preview_key,preview,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
 if(upload.error){
  if(String(upload.error.statusCode)!=='409')return reply({error:'Could not save preview. Retry finalizing this upload.'},503);
  // Retry after a lost response can safely reuse an identical immutable preview.
  const existing=await bucket.download(photo.preview_key);
  if(existing.error||!existing.data||await digest(new Uint8Array(await existing.data.arrayBuffer()))!==await digest(preview))return reply({error:'An incompatible preview exists. Remove this incomplete upload and upload the photo again.'},409);
 }
 const updated=await client.from('gallery_photos').update({ready:true,hidden:false,original_bytes:original.data.size,preview_bytes:preview.length}).eq('id',photo.id).eq('ready',false);
 return updated.error?reply({error:'Preview saved, but finalization failed. Retry finalizing.'},409):reply({ready:true});
}
