// Called only after the handler verifies an active owner session and AAL2.
export async function ownerCommerce(service, reply, packs, checkoutEnabled) {
 const result=await service.from('gallery_experiences').select('event_id,created_at,closes_at,enabled').or('studio_user.not.is.null,upload_later.eq.true').order('created_at',{ascending:false}).limit(501);
 if(result.error)return reply({error:'Unable to load online photo workspaces. Please retry.'},503);
 const later=await service.from('gallery_order_uploads').select('id,event_id,order_id,order_name,product_title,required_count,status,revision,submitted_at,created_at,email_sent_at,email_error').order('created_at',{ascending:false}).limit(500);
 if(later.error)return reply({error:'Unable to load purchased photo uploads.'},503);
 return reply({laterOrders:later.data,workspaces:result.data.slice(0,500),truncated:result.data.length>500,checkoutEnabled:checkoutEnabled===true,currency:'USD',packs:packs.map(({count,cents,variant})=>({count,cents,variant:variant.split('/').at(-1)}))});
}

