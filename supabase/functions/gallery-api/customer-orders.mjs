// Called only after handler.mts verifies getUser, gallery_session_active and MFA.
// Narrow service reads to requests already authorized through the caller's RLS.
export async function customerOrders(client, service, user, reply) {
 const result=await client.from('gallery_requests').select('id,event_id,items,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
 if(result.error)return reply({error:'Order history unavailable.'},503);
 const requests=result.data||[];
 if(!requests.length)return reply({orders:[]});
 const events=await client.from('gallery_events').select('id,name').in('id',[...new Set(requests.map(r=>r.event_id))]).eq('active',true);
 if(events.error)return reply({error:'Order history unavailable.'},503);
 const allowed=new Map((events.data||[]).map(e=>[e.id,e.name]));
 const visible=requests.filter(r=>allowed.has(r.event_id));
 const orders=[];
 for(const request of visible) {
  const payment=await service.from('gallery_payments').select('order_name,financial_status,cancelled,is_test,refund_activity,lines').contains('lines',JSON.stringify([{request_id:request.id}])).order('shop_updated_at',{ascending:false}).limit(2);
  if(payment.error)return reply({error:'Payment status unavailable.'},503);
  const rows=(payment.data||[]).filter(p=>!p.is_test);
  const record=rows.length===1?rows[0]:null;
  const line=record?.lines?.find(l=>l.request_id===request.id);
  let status='unconfirmed';
  if(record) {
   if(record.cancelled)status='cancelled';
   else if(['refunded','partially_refunded'].includes(record.financial_status))status=record.financial_status;
   else if(record.refund_activity||line?.match_status!=='matched')status='review';
   else if(record.financial_status==='paid')status='paid';
  } else if(rows.length>1)status='review';
  // Don't return information if an invitation/session is revoked during reads.
  const [active,current,event]=await Promise.all([
   client.rpc('gallery_session_active'),
   client.from('gallery_requests').select('id').eq('id',request.id).eq('user_id',user.id).maybeSingle(),
   client.from('gallery_events').select('id').eq('id',request.event_id).eq('active',true).maybeSingle()
  ]);
  if(active.error||active.data!==true)return reply({error:'Sign in again.'},401);
  if(current.error||event.error)return reply({error:'Unable to verify order access.'},503);
  if(!current.data||!event.data)continue;
  orders.push({id:request.id,eventId:request.event_id,eventName:allowed.get(request.event_id),createdAt:request.created_at,
   payment:status,production:request.status,orderName:record?.order_name||null,items:(request.items||[]).map(item=>({...item,zoom:item.zoom??1})),
   tracking:status==='paid'?safeTracking(line?.tracking):[]});
 }
 return reply({orders});
}

export function safeTracking(items) {
 if(!Array.isArray(items))return [];
 return items.slice(0,20).filter(t=>typeof t.number==='string'&&t.number.length>0&&t.number.length<=100).map(t=>({
  number:t.number,company:typeof t.company==='string'?t.company.slice(0,100):null,
  status:['confirmed','in_transit','out_for_delivery','delivered','failure','success'].includes(t.status)?t.status:null,
  url:safeTrackingURL(t.url)
 }));
}
function safeTrackingURL(value) {
 try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
