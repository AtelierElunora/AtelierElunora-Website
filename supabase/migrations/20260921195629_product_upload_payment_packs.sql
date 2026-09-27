-- Match current Shopify pack prices while preserving valid historical gallery-price deliveries.
CREATE OR REPLACE FUNCTION public.record_gallery_payment(p_delivery text, p_topic text, p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 oid text:=p_order->>'order_id';
 prior public.gallery_payments%rowtype;
 l jsonb; normalized jsonb:='[]'; ref text; rid uuid; expected_count int; expected_cents int; magnet_count int; result text; snapshot_status text; sample boolean;
begin
 if oid is null or oid !~ '^[0-9]{1,25}$' or length(p_delivery)>200 or length(p_delivery)<1 or p_topic not in ('orders/paid','orders/updated','orders/cancelled','refunds/create') then raise exception 'Invalid delivery';end if;
 perform pg_advisory_xact_lock(hashtextextended(oid,0));
 if exists(select 1 from public.gallery_payment_events where delivery_id=p_delivery) then return '{"duplicate":true}';end if;
 if p_topic='refunds/create' then
  if p_order->>'refund_id' is null or (p_order->>'refund_id') !~ '^[0-9]{1,25}$' then raise exception 'Invalid refund';end if;
  insert into public.gallery_payment_refunds(refund_id,order_id) values(p_order->>'refund_id',oid) on conflict do nothing;
  update public.gallery_payments set refund_activity=true,received_at=now() where order_id=oid;
 else
  if jsonb_typeof(p_order->'lines') is distinct from 'array' or jsonb_array_length(p_order->'lines')>250 or p_order->>'updated_at' is null then raise exception 'Invalid order';end if;
  select * into prior from public.gallery_payments where order_id=oid for update;
  -- Older deliveries cannot revert a refund/cancellation or overwrite newer selections.
  if prior.order_id is not null and prior.shop_updated_at>(p_order->>'updated_at')::timestamptz then
   insert into public.gallery_payment_events(delivery_id,topic,order_id) values(p_delivery,p_topic,oid);
   return '{"stale":true}';
  end if;
  for l in select value from jsonb_array_elements(p_order->'lines') loop
   ref:=l->>'reference';rid:=null;magnet_count:=null;snapshot_status:=null;sample:=null;
   select pack.count,case when (l->>'unit_cents')::bigint=pack.legacy_cents then pack.legacy_cents else pack.cents end into expected_count,expected_cents from (values
    ('52368201875744',6,2500,null::int),('52368201908512',12,3900,4500),('52368201941280',24,6900,8000),('52368201974048',48,11900,12500),
    ('52214866018592',6,2500,null::int),('52214866051360',12,3900,null::int),('52214866084128',24,6900,null::int),('52214866116896',48,11900,null::int)
   ) as pack(variant,count,cents,legacy_cents) where pack.variant=l->>'variant_id';
   result:='missing_reference';
   if ref ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select r.id,r.status,e.is_sample,(select sum((x->>'quantity')::int) from jsonb_array_elements(r.items) x) into rid,snapshot_status,sample,magnet_count
    from public.gallery_requests r join public.gallery_events e on e.id=r.event_id where r.id=ref::uuid;
    result:=case when rid is null then 'unknown_reference' when sample then 'sample_gallery' when snapshot_status='cancelled' then 'cancelled_selection'
     when expected_count is null then 'wrong_product' when (l->>'quantity')::int<>1 or magnet_count<>expected_count or (l->>'count')::int is distinct from expected_count then 'quantity_mismatch'
     when p_order->>'currency'<>'USD' or (l->>'unit_cents')::bigint<>expected_cents then 'price_mismatch' else 'matched' end;
   end if;
   if result='matched' and (
    (select count(*) from jsonb_array_elements(p_order->'lines') x where x->>'reference'=ref)>1 or
    exists(select 1 from public.gallery_payments gp cross join lateral jsonb_array_elements(gp.lines) x where gp.order_id<>oid and x->>'request_id'=rid::text)
   ) then
    result:='duplicate_reference';
    update public.gallery_payments gp set lines=(select jsonb_agg(case when x->>'request_id'=rid::text then x||'{"match_status":"duplicate_reference"}'::jsonb else x end) from jsonb_array_elements(gp.lines) x)
    where gp.order_id<>oid and gp.lines @> jsonb_build_array(jsonb_build_object('request_id',rid));
   end if;
   normalized:=normalized||jsonb_build_array(l||jsonb_build_object('request_id',rid,'match_status',result));
  end loop;
  if jsonb_array_length(normalized)>0 or prior.order_id is not null then
   insert into public.gallery_payments(order_id,order_name,financial_status,cancelled,is_test,currency,total_cents,shop_updated_at,lines,refund_activity)
   values(oid,left(p_order->>'name',100),p_order->>'financial_status',(p_order->>'cancelled')::boolean,(p_order->>'is_test')::boolean,p_order->>'currency',(p_order->>'total_cents')::bigint,(p_order->>'updated_at')::timestamptz,normalized,exists(select 1 from public.gallery_payment_refunds where order_id=oid))
   on conflict(order_id) do update set order_name=excluded.order_name,
    financial_status=case when gallery_payments.shop_updated_at=excluded.shop_updated_at and gallery_payments.financial_status in ('refunded','partially_refunded','voided') then gallery_payments.financial_status else excluded.financial_status end,
    refund_activity=gallery_payments.refund_activity or excluded.refund_activity,cancelled=gallery_payments.cancelled or excluded.cancelled,is_test=excluded.is_test,currency=excluded.currency,total_cents=excluded.total_cents,
    shop_updated_at=excluded.shop_updated_at,received_at=now(),lines=excluded.lines;
  end if;
 end if;
 insert into public.gallery_payment_events(delivery_id,topic,order_id) values(p_delivery,p_topic,oid);
 return '{"recorded":true}';
end $function$;

REVOKE ALL ON FUNCTION public.record_gallery_payment(text,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_gallery_payment(text,text,jsonb) TO service_role;
