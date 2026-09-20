const SHOP='v0j63n-ms.myshopify.com';
const variants=new Set(['52368201875744','52368201908512','52368201941280','52368201974048']);
const topics=new Set(['orders/paid','orders/updated','orders/cancelled','refunds/create']);
const encoder=new TextEncoder();
function id(value,gid){if(typeof gid==='string'&&/^gid:\/\/shopify\/\w+\/\d{1,25}$/.test(gid))return gid.split('/').at(-1);if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Unsafe numeric identifier');const s=String(value??'');if(!/^\d{1,25}$/.test(s))throw Error('Missing identifier');return s;}
function cents(value){if(typeof value!=='string'||!/^\d{1,10}(\.\d{1,2})?$/.test(value))throw Error('Invalid amount');const [a,b='']=value.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
export function normalize(topic,b){
 if(topic==='refunds/create')return {order_id:id(b.order_id),refund_id:id(b.id,b.admin_graphql_api_id)};
 if(!Array.isArray(b.line_items)||b.line_items.length>250||!Number.isFinite(Date.parse(b.updated_at))||typeof b.test!=='boolean'||typeof b.name!=='string'||!['pending','authorized','partially_paid','paid','partially_refunded','refunded','voided'].includes(b.financial_status)||typeof b.currency!=='string')throw Error('Invalid order');
 const lines=[];
 for(const l of b.line_items){
  const v=l.variant_id==null?'':id(l.variant_id),properties=Array.isArray(l.properties)?l.properties:[],refs=properties.filter(x=>x.name==='Gallery selection');
  if(!variants.has(v)&&!refs.length)continue;
  const counts=properties.filter(x=>x.name==='Magnet count');
  const reference=refs.length===1&&typeof refs[0].value==='string'?refs[0].value.slice(0,200):'';
  const quantity=l.current_quantity??l.quantity;
  if(!Number.isSafeInteger(quantity)||quantity<0||quantity>10000)throw Error('Invalid quantity');
  const count=counts.length===1&&/^\d{1,4}$/.test(String(counts[0].value))?Number(counts[0].value):0;
  lines.push({line_id:id(l.id,l.admin_graphql_api_id),variant_id:v,reference,count,quantity,unit_cents:cents(l.price)});
 }
 return {order_id:id(b.id,b.admin_graphql_api_id),name:b.name.slice(0,100),financial_status:b.financial_status,cancelled:!!b.cancelled_at,is_test:b.test,currency:b.currency,total_cents:cents(b.current_total_price??b.total_price),updated_at:b.updated_at,lines};
}
async function validHmac(bytes,signature,secret){
 if(!/^[A-Za-z0-9+/]{43}=$/.test(signature||''))return false;
 const sig=Uint8Array.from(atob(signature),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,sig,bytes);
}
export function makeHandler({secret,record}){return async request=>{
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!secret)return reply({error:'Payment notifications are not configured'},503);
 if(request.headers.get('x-shopify-shop-domain')!==SHOP)return reply({error:'Invalid shop'},401);
 const topic=request.headers.get('x-shopify-topic'),delivery=request.headers.get('x-shopify-webhook-id');
 if(!topics.has(topic)||!delivery||delivery.length>200)return reply({error:'Invalid delivery'},400);
 let size=0;const chunks=[],reader=request.body?.getReader();if(!reader)return reply({error:'Missing body'},400);
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();return reply({error:'Body too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  if(!await validHmac(bytes,request.headers.get('x-shopify-hmac-sha256'),secret))return reply({error:'Invalid signature'},401);
  const order=normalize(topic,JSON.parse(new TextDecoder().decode(bytes)));
  await record(delivery,topic,order);
  return reply({received:true});
 }catch{return reply({error:'Unable to process delivery; retry required'},503);}
};}
