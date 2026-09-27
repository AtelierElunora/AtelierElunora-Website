import {createClient} from '@supabase/supabase-js';
import {sendLaterEmail} from './later-email.mjs';
import {makeHandler} from './handler.mjs';
// Shopify authenticates with HMAC, not a Supabase JWT. Database credentials never leave this function.
const env=Deno.env;
Deno.serve(makeHandler({secret:env.get('SHOPIFY_WEBHOOK_SECRET'),record:async(delivery:string,topic:string,order:{order_id:string})=>{
 const modern=env.get('SUPABASE_SECRET_KEYS');
 const key=(modern?JSON.parse(modern).default:null)||env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!key)throw Error('Missing server credential');
 const headers:Record<string,string>={'Content-Type':'application/json',apikey:key};
 if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const r=await fetch(env.get('SUPABASE_URL')+'/rest/v1/rpc/record_gallery_payment',{method:'POST',headers,body:JSON.stringify({p_delivery:delivery,p_topic:topic,p_order:order}),signal:AbortSignal.timeout(3500)});
 if(!r.ok)throw Error('Database write failed');
 const service=createClient(env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const pending=await service.from('gallery_order_uploads').select('id').eq('order_id',order.order_id).eq('status','awaiting_photos').lte('required_count',200).is('email_sent_at',null);
 if(pending.error)throw Error('Unable to check upload emails');
 for(const upload of pending.data)await sendLaterEmail(service,upload.id,{secret:env.get('SHOPIFY_WEBHOOK_SECRET'),key:env.get('RESEND_API_KEY')});
}}));
