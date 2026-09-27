import {paymentReview,linkedPayments} from '../extensions/gallery-owner/src/workflows.mjs';
export function commerceOrders(data,commerce,{query='',filter='all'}={}){
 const ids=new Set(commerce.workspaces.map(w=>w.event_id));
 return data.requests.filter(r=>ids.has(r.event_id)).filter(r=>{
  const paid=paymentReview(r,data.payments)==='Verified paid order',closed=['completed','cancelled'].includes(r.status);
  const state=closed?r.status:paid?'paid':'review';
  const terms=[r.email,r.id,...linkedPayments(r,data.payments).flatMap(p=>[p.order_name,p.customer_email])].join(' ').toLowerCase();
  return (filter==='all'||state===filter)&&terms.includes(query.trim().toLowerCase());
 });
}
export function uploaderLink(galleryUrl,origin,search=''){
 const source=new URL(galleryUrl||'/pages/client-gallery',origin);
 const url=new URL('/pages/client-gallery',origin);url.searchParams.set('view','photo-magnets');
 const preview=new URLSearchParams(search).get('preview_theme_id')||(source.origin===url.origin?source.searchParams.get('preview_theme_id'):null);
 if(/^\d+$/.test(preview||''))url.searchParams.set('preview_theme_id',preview);
 return url.href;
}
