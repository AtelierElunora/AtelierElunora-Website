import test from 'node:test';
import assert from 'node:assert/strict';
import {customerOrders,safeTracking} from '../supabase/functions/gallery-api/customer-orders.mjs';
import {guestOriginal} from '../supabase/functions/gallery-api/guest-original.mjs';
import {normalize,makeHandler} from '../supabase/functions/shopify-gallery-payments/handler.mjs';

const event='00000000-0000-0000-0000-000000000001',photo='00000000-0000-0000-0000-000000000002';
const key=event+'/'+photo+'/original.jpg';
function query(result,filters=[]) {
 return {select(){return this},eq(k,v){filters.push([k,v]);return this},in(){return this},order(){return this},limit(){return this},contains(k,v){filters.push([k,v]);return this},maybeSingle:async()=>result,then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
}
const reply=(body,status=200)=>({body,status});

test('unauthorized original never reads privileged storage',async()=>{
 let calls=0;
 const client={from:()=>query({data:null}),rpc:async()=>({data:true})};
 const result=await guestOriginal(client,event,photo,reply,new Headers(),()=>{calls++;throw Error()});
 assert.equal(result.status,404);assert.equal(calls,0);
});
test('original denies path traversal and oversized bytes before storage',async()=>{
 for(const original of [{original_key:key+'/../x',original_bytes:100},{original_key:key,original_bytes:26*1024*1024}]){
  const client={from:()=>query({data:original})};
  const result=await guestOriginal(client,event,photo,reply,new Headers(),()=>{throw Error('must not read')});
  assert.ok([404,413].includes(result.status));
 }
});
test('revocation during original download fails closed',async()=>{
 let reads=0;
 const client={from:table=>query({data:table==='gallery_events'?null:++reads===1?{original_key:key,original_bytes:3,filename:'a.jpg'}:null}),rpc:async()=>({data:true})};
 const result=await guestOriginal(client,event,photo,reply,new Headers(),()=>({from:()=>({download:async()=>({data:new Blob(['abc'])})})}));
 assert.equal(result.status,404);
});
test('original bytes are unchanged and privately served',async()=>{
 const client={from:table=>query({data:table==='gallery_events'?{id:event}:{original_key:key,original_bytes:3,filename:'a.jpg'}}),rpc:async()=>({data:true})};
 const result=await guestOriginal(client,event,photo,reply,new Headers(),()=>({from:()=>({download:async()=>({data:new Blob(['abc'])})})}));
 assert.equal(result.status,200);assert.equal(await result.text(),'abc');assert.equal(result.headers.get('cache-control'),'private, no-store');
});
test('customer orders narrow user and payment reads and omit other line tracking',async()=>{
 const filters=[];let paymentFilter;
 const client={from:table=>table==='gallery_requests'?query({data:{id:'mine'}},filters):query({data:{id:event}}),rpc:async()=>({data:true})};
 let calls=0;
 client.from=table=>{
  if(table==='gallery_requests')return ++calls===1?query({data:[{id:'mine',event_id:event,items:[],created_at:'2026-10-01',status:'preparing'}]},filters):query({data:{id:'mine'}},filters);
  return query({data:calls===1?[{id:event,name:'Wedding'}]:{id:event}});
 };
 const payment={order_name:'#1',financial_status:'paid',cancelled:false,is_test:false,refund_activity:false,lines:[{request_id:'mine',match_status:'matched',tracking:[{number:'mine',url:'https://courier.invalid/1'}]},{request_id:'other',tracking:[{number:'other'}]}]};
 const service={from:()=>{const q=query({data:[payment]});q.contains=(k,v)=>{assert.equal(k,'lines');assert.equal(typeof v,'string','JSONB containment must bypass the SDK Postgres-array serialization');paymentFilter=v;return q};return q}};
 const result=await customerOrders(client,service,{id:'user'},reply);
 assert.equal(result.status,200);assert.deepEqual(JSON.parse(paymentFilter),[{request_id:'mine'}]);
 assert.ok(filters.some(([k,v])=>k==='user_id'&&v==='user'));
 assert.equal(result.body.orders[0].payment,'paid');assert.deepEqual(result.body.orders[0].tracking.map(t=>t.number),['mine']);
});
test('no caller requests means no service payment reads',async()=>{
 const result=await customerOrders({from:()=>query({data:[]})},{from:()=>{throw Error('not allowed')}},{id:'guest'},reply);
 assert.deepEqual(result.body,{orders:[]});
});
test('tracking rejects insecure links and unknown status',()=>{
 const tracking=safeTracking([{number:'1',url:'http://courier.invalid',status:'invented'},{number:'2',url:'https://user:password@courier.invalid'}]);
 assert.equal(tracking[0].url,null);assert.equal(tracking[0].status,null);assert.equal(tracking[1].url,null);
});
test('webhook attaches fulfillment only to matching line, never cancelled fulfillment',()=>{
 const order={id:'1',updated_at:'2026-10-01T00:00:00Z',test:false,name:'#1',financial_status:'paid',currency:'USD',total_price:'24.99',line_items:[{id:'10',variant_id:'52368201875744',quantity:1,price:'24.99',properties:[{name:'Gallery selection',value:photo},{name:'Magnet count',value:'6'}]}],fulfillments:[{status:'success',line_items:[{id:'10'}],tracking_numbers:['mine'],tracking_urls:['https://courier.invalid'],tracking_company:'Courier',shipment_status:'in_transit'},{status:'success',line_items:[{id:'11'}],tracking_numbers:['other']},{status:'cancelled',line_items:[{id:'10'}],tracking_numbers:['cancelled']}]};
 assert.deepEqual(normalize('orders/updated',order).lines[0].tracking.map(t=>t.number),['mine']);
});
test('invalid webhook signature never records payment or shipping',async()=>{
 let records=0;
 const handler=makeHandler({secret:'test-secret',record:async()=>records++});
 const result=await handler(new Request('https://example.invalid',{method:'POST',headers:{'x-shopify-shop-domain':'v0j63n-ms.myshopify.com','x-shopify-topic':'orders/updated','x-shopify-webhook-id':'test','x-shopify-hmac-sha256':'invalid'},body:'{}'}));
 assert.equal(result.status,401);assert.equal(records,0);
});

// Older snapshots predate zoom; Swift's VerifiedOrderItem requires a numeric value.
test('legacy order snapshots without zoom return the original default crop',async()=>{
 let reads=0;
 const snapshot={id:'mine',event_id:event,created_at:'2026-10-01T00:00:00Z',status:'submitted',items:[{photoId:photo,quantity:6,x:30,y:70},{photoId:photo,quantity:1,x:50,y:50,zoom:2}]};
 const client={from:table=>{
  if(table==='gallery_requests')return ++reads===1?query({data:[snapshot]}):query({data:{id:'mine'}});
  return query({data:reads===1?[{id:event,name:'Test gallery'}]:{id:event}});
 },rpc:async()=>({data:true})};
 const result=await customerOrders(client,{from:()=>query({data:[]})},{id:'user'},reply);
 assert.equal(result.status,200);
 assert.deepEqual(result.body.orders[0].items,[{photoId:photo,quantity:6,x:30,y:70,zoom:1},{photoId:photo,quantity:1,x:50,y:50,zoom:2}]);
 assert.equal(snapshot.items[0].zoom,undefined); // Read-time compatibility; no stored-order mutation.
});

// A cancelled real order remains visible; its old tracking must not be presented as active.
test('cancelled matched orders remain visible without tracking',async()=>{
 let reads=0;
 const client={from:table=>{
  if(table==='gallery_requests')return ++reads===1?query({data:[{id:'mine',event_id:event,items:[],status:'submitted'}]}):query({data:{id:'mine'}});
  return query({data:reads===1?[{id:event,name:'Test gallery'}]:{id:event}});
 },rpc:async()=>({data:true})};
 const payment={order_name:'#1',financial_status:'refunded',cancelled:true,is_test:false,lines:[{request_id:'mine',match_status:'matched',tracking:[{number:'old'}]}]};
 const result=await customerOrders(client,{from:()=>query({data:[payment]})},{id:'user'},reply);
 assert.equal(result.status,200);
 assert.equal(result.body.orders.length,1);
 assert.equal(result.body.orders[0].payment,'cancelled');
 assert.equal(result.body.orders[0].orderName,'#1');
 assert.deepEqual(result.body.orders[0].tracking,[]);
});
