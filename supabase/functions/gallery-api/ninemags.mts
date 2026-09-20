import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {runtime} from './runtime.mts';

type Item={photoId:string;quantity:number;x:number;y:number};
type Pack={count:number;cents:number;variant:string};
export async function prepareNineMags(client:SupabaseClient,userId:string,eventId:string,reference:string,pack:Pack,sign?: (paths:string[])=>Promise<{path:string;signedUrl:string;error?:string|null}[]>){
 // Re-authorize through the guest's client before touching privileged storage.
 const event=await client.from('gallery_events').select('id').eq('id',eventId).eq('active',true).maybeSingle();
 const snapshot=await client.from('gallery_requests').select('items,status').eq('id',reference).eq('event_id',eventId).eq('user_id',userId).maybeSingle();
 if(event.error||!event.data||snapshot.error||!snapshot.data||snapshot.data.status!=='submitted')throw Error('Gallery access or selection is no longer available.');
 const items=snapshot.data.items as Item[];
 if(!Array.isArray(items)||!items.length||items.length>50||items.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>12||![i.x,i.y].every(n=>Number.isFinite(n)&&n>=0&&n<=100))||items.reduce((n,i)=>n+i.quantity,0)!==pack.count)throw Error('Reload and review your selection.');
 const photos=await client.from('gallery_photos').select('id,filename,original_key').eq('event_id',eventId).eq('ready',true).eq('hidden',false).in('id',items.map(i=>i.photoId));
 if(photos.error||photos.data?.length!==items.length)throw Error('A selected photo is no longer available.');
 const ordered=items.map(i=>photos.data!.find(p=>p.id===i.photoId)!);
 if(ordered.some(p=>!p?.original_key?.startsWith(eventId+'/'+p.id+'/')))throw Error('An original is unavailable for this selection.');
 const paths=ordered.map(p=>p.original_key);
 if(!sign){
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret)throw Error('Photo transfer is temporarily unavailable.');
  const storage=createClient(runtime.url,secret,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('gallery-originals');
  sign=async keys=>{const r=await storage.createSignedUrls(keys,300);if(r.error||!r.data)throw Error('Photo transfer is temporarily unavailable.');return r.data;};
 }
 const signed=await sign(paths);
 const result=items.map((i,n)=>{const s=signed.find(s=>s.path===paths[n]);if(!s?.signedUrl||s.error)throw Error('Photo transfer is temporarily unavailable.');return {...i,filename:ordered[n].filename,url:s.signedUrl};});
 return {reference,count:pack.count,cents:pack.cents,variant:pack.variant.split('/').at(-1),expiresAt:Date.now()+300000,items:result};
}
