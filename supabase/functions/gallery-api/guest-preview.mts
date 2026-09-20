import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {runtime} from './runtime.mts';

// Privileged Storage reads are allowed only after a user-scoped photo lookup.
// Storage is never exposed as a signing endpoint or an arbitrary-key proxy.
export async function guestPreview(client:SupabaseClient,eventId:string,photoId:string,reply:(body:unknown,status?:number)=>Response,headers:Headers,storageFactory=()=>{
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!secret)throw Error('Preview service unavailable');
 return createClient(runtime.url,secret,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
}){
 const lookup=()=>client.from('gallery_photos').select('preview_key').eq('event_id',eventId).eq('id',photoId).eq('ready',true).eq('hidden',false).maybeSingle();
 const initial=await lookup();
 if(initial.error)return reply({error:'Unable to load photo. Please retry.'},503);
 const key=initial.data?.preview_key;
 if(typeof key!=='string'||!key.startsWith(eventId+'/'+photoId+'/')||key.includes('..'))return reply({error:'Photo unavailable.'},404);
 let result;
 try{result=await storageFactory().from('gallery-previews').download(key);}catch{return reply({error:'Unable to load photo. Please retry.'},503);}
 if(result.error||!result.data)return reply({error:'Unable to load photo. Please retry.'},503);
 // Recheck after the download so access removed during transfer fails closed.
 const current=await lookup();
 if(current.error)return reply({error:'Unable to verify photo access. Please retry.'},503);
 if(current.data?.preview_key!==key)return reply({error:'Photo unavailable.'},404);
 const out=new Headers(headers);out.set('Content-Type','image/jpeg');out.set('Cache-Control','private, no-store');
 return new Response(result.data,{headers:out});
}
