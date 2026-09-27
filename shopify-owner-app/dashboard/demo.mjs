import {normalizeTemplate} from '../../supabase/functions/gallery-api/magnet-template.mjs';
export function createDemo(root){
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const events=[{id:id(1),name:'Emma & Oliver',event_date:'2026-10-17',active:true},{id:id(2),name:'The autumn gathering',event_date:'2026-10-24',active:false},{id:id(3),name:'Isabella’s bridal shower',event_date:'2026-09-19',active:true}];
 const photos=Array.from({length:6},(_,i)=>({id:id(20+i),filename:'Celebration '+(i+1)+'.jpg',ready:true,hidden:i===5,original_bytes:2400000,preview_bytes:80000}));
 const requests=[{id:id(50),event_id:id(1),email:'guest@example.com',status:'submitted',created_at:'2026-09-21T14:15:00Z',items:[{photoId:photos[0].id,quantity:6,x:50,y:50,zoom:1}]}];
 const payments=[{order_id:'1001',order_name:'#1001',financial_status:'paid',currency:'USD',total_cents:2400,refund_activity:false,cancelled:false,is_test:false,lines:[{request_id:id(50),match_status:'matched'}]}];
 const configs={},templates={},stations={},jobs={},moderation={};
 function photoUrl(p){return root.dataset['demoImage'+((photos.findIndex(x=>x.id===p.id)%3)+1)]||root.dataset.demoImage1;}
 return async function call(path,body){
  await new Promise(r=>setTimeout(r,60));const parts=path.split('/'),eid=parts[2],event=events.find(e=>e.id===eid);
  if(path==='owner')return structuredClone({events,requests,payments,usage:[{bucket_id:'gallery-originals',bytes:43200000,objects:18},{bucket_id:'gallery-previews',bytes:1440000,objects:18}],lastPaymentDelivery:'2026-09-21T14:16:00Z'});
  if(path==='owner/commerce')return {workspaces:[{event_id:id(1),enabled:true,closes_at:'2099-01-01'}],checkoutEnabled:false,currency:'USD',packs:[{count:6,cents:2500,variant:'52368201875744'},{count:12,cents:4500,variant:'52368201908512'}]};
  if(path==='owner/activity')return {activity:[{id:'a',occurred_at:'2026-09-21T14:15:00Z',action:'event.create',outcome:'succeeded',event_id:id(1)},{id:'b',occurred_at:'2026-09-21T14:10:00Z',action:'station.print.claim',outcome:'committed',event_id:id(3)}]};
  if(path==='owner/events'&&body){const e={id:crypto.randomUUID(),name:body.name,event_date:body.date,active:false};events.unshift(e);return {event:structuredClone(e)};}
  if(path.startsWith('owner/requests/')){const r=requests.find(r=>r.id===eid);r.status=body.status;return {saved:true};}
  if(path==='owner/production'){jobs[id(1)]=[{id:id(90),status:'pending',quantity:6,created_at:new Date().toISOString()}];return {queued:1};}
  if(parts[1]==='events'&&event){
   if(parts.length===3){if(body){if(body.action==='trash'){event.deleted_at=new Date().toISOString();event.active=false;}else if(body.action==='restore'){event.deleted_at=null;event.active=false;}else event.active=body.active;}return structuredClone({event,photos:event.id===id(2)?[]:photos,invitations:[],grants:[]});}
   if(parts[3]==='photos'){const photo=photos.find(p=>p.id===parts[4]);if(parts[5])return {url:photoUrl(photo)};photo.hidden=body.hidden;return {saved:true};}
   if(parts[3]==='access')throw Error('Guest invitations are available in the live studio. This preview does not send invitations.');
  }
  if(parts[1]==='experience'&&event){
   configs[eid]??={enabled:true,welcome:'A little moment, a lasting memory.',closes_at:'2026-12-01T00:00:00Z',moderation:true,downloads:true,guest_limit:30,event_limit:2000};
   if(body.action==='list')return structuredClone({config:configs[eid],url:configs[eid].url??null,photos:photos.slice(0,3).map((p,i)=>({...p,status:moderation[eid+':'+p.id]||(i===0?'pending':'approved'),url:photoUrl(p)})),next:null});
   if(body.action==='save'){configs[eid]={...configs[eid],url:body.rotate||!configs[eid].url?location.origin+location.pathname+'?demo=1#demo-qr-'+crypto.randomUUID():configs[eid].url,enabled:body.enabled,welcome:body.welcome,closes_at:body.closesAt,moderation:body.moderation,downloads:body.downloads,guest_limit:body.guestLimit,event_limit:body.eventLimit};return {saved:true,url:configs[eid].url};}
   if(['approve','reject'].includes(body.action))moderation[eid+':'+body.photoId]=body.action==='approve'?'approved':'rejected';
   if(body.action==='print'){jobs[eid]??=[];jobs[eid].push({id:crypto.randomUUID(),status:'pending',quantity:1,created_at:new Date().toISOString()});}return {saved:true};
  }
  if(parts[1]==='station'&&event){
   templates[eid]??=normalizeTemplate({enabled:true,couple:event.name,company:'Atelier Elunora'});stations[eid]??=[];
   if(body?.action==='template')templates[eid]=body.template;
   if(body?.action==='create'){const s={id:crypto.randomUUID(),purpose:body.purpose,expires_at:new Date(Date.now()+43200000).toISOString()};stations[eid].push(s);return {...s,expiresAt:s.expires_at,url:location.origin+location.pathname+'?demo=1#demo-station'};}
   if(body?.action==='revoke')stations[eid]=stations[eid].filter(s=>s.id!==body.id);
   return structuredClone({template:templates[eid],stations:stations[eid],jobs:jobs[eid]||[],counts:{pending:(jobs[eid]||[]).length,printing:0,held:0,printed:0}});
  }
  throw Error('This action is available after signing in to your live studio. Demo changes stay in this tab.');
 };
}
