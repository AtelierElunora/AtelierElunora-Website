import {hash,uuid} from './station.mjs';
import {laterLink,sendLaterEmail} from './later-email.mjs';
const checked=r=>{if(r.error)throw Object.assign(Error('Unable to update this order. Reload and retry.'),{code:r.error.code});return r.data;};
export const laterPublic=u=>({id:u.id,eventId:u.event_id,orderName:u.order_name,productTitle:u.product_title,requiredCount:u.required_count,status:u.status,items:u.items,revision:u.revision});
export async function laterRequest(body,service,reply){
 try{
  if(typeof body.session!=='string'||!/^[a-f0-9]{64}$/.test(body.session))return reply({error:'Open your private upload link.'},403);
  const digest=await hash(body.session),s=checked(await service.rpc('gallery_experience_check',{p_token:digest}));
  const row=checked(await service.from('gallery_order_uploads').select('id').eq('event_id',s.event_id).maybeSingle());
  if(!row)return reply({error:'Order unavailable.'},403);
  const u=checked(await service.rpc('gallery_later_check',{p_id:row.id}));
  if(body.action==='load')return reply(laterPublic(u));
  if(['save','submit'].includes(body.action)){
   if(!Number.isSafeInteger(body.revision)||body.revision<0||!Array.isArray(body.items))return reply({error:'Invalid photo selection.'},400);
   return reply(laterPublic(checked(await service.rpc('gallery_later_save',{p_session:digest,p_items:body.items,p_revision:body.revision,p_submit:body.action==='submit'}))));
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){return reply({error:e.code==='PT403'?'This upload link or order is no longer available. Contact Atelier Elunora.':e.code==='PT409'?'This selection changed or was already submitted. Reload your saved photos.':e.code==='PT422'?'Select exactly the number of magnets included with your order.':e.message},({'PT403':403,'PT409':409,'PT422':422})[e.code]||503);}
}
export async function ownerLater(body,service,reply,config){
 try{
  if(!uuid(body.id))return reply({error:'Invalid order.'},400);
  if(body.action==='link'){const {url}=await laterLink(service,body.id,config.secret);return reply({url});}
  if(body.action==='resend')return reply(await sendLaterEmail(service,body.id,config,true));
  if(body.action==='produce')return reply({queued:checked(await service.rpc('gallery_later_produce',{p_id:body.id}))});
  if(body.action==='complete'){
   const jobs=checked(await service.from('gallery_print_jobs').select('status').eq('source_order_upload_id',body.id));
   if(!jobs.length||jobs.some(j=>j.status!=='printed'))return reply({error:'Finish printing all magnets before completing this order.'},409);
   checked(await service.from('gallery_order_uploads').update({status:'completed'}).eq('id',body.id).eq('status','queued'));return reply({completed:true});
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){return reply({error:e.message},409);}
}

