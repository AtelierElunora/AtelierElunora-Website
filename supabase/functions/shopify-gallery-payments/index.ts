import {makeHandler} from './handler.mjs';
// Shopify authenticates with HMAC, not a Supabase JWT. Database credentials never leave this function.
const env=Deno.env;
Deno.serve(makeHandler({secret:env.get('SHOPIFY_WEBHOOK_SECRET'),record:async(delivery:string,topic:string,order:unknown)=>{
 const modern=env.get('SUPABASE_SECRET_KEYS');
 const key=(modern?JSON.parse(modern).default:null)||env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!key)throw Error('Missing server credential');
 const headers:Record<string,string>={'Content-Type':'application/json',apikey:key};
 if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const r=await fetch(env.get('SUPABASE_URL')+'/rest/v1/rpc/record_gallery_payment',{method:'POST',headers,body:JSON.stringify({p_delivery:delivery,p_topic:topic,p_order:order}),signal:AbortSignal.timeout(3500)});
 if(!r.ok)throw Error('Database write failed');
}}));
