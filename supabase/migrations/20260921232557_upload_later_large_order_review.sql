-- Keep oversized paid cart lines visible for owner review instead of dropping them.
alter table public.gallery_order_uploads drop constraint gallery_order_uploads_required_count_check;
alter table public.gallery_order_uploads add constraint gallery_order_uploads_required_count_check check(required_count between 1 and 480000);
create or replace function public.sync_order_photo_uploads() returns trigger language plpgsql security invoker set search_path='' as $$
declare l jsonb; product public.gallery_later_products; eid uuid; n integer;
begin
 if new.financial_status<>'paid' or new.cancelled or new.refund_activity or new.is_test or new.currency<>'USD' then return new;end if;
 for l in select value from jsonb_array_elements(new.lines) loop
  if l->>'upload_later' is distinct from 'true' then continue;end if;
  select * into product from public.gallery_later_products where variant_id=l->>'variant_id';
  if not found then continue;end if;
  n=(l->>'quantity')::integer*product.photo_count;
  if n not between 1 and 480000 then continue;end if;
  if exists(select 1 from public.gallery_order_uploads where order_id=new.order_id and line_id=l->>'line_id') then continue;end if;
  insert into public.gallery_events(name,event_date) values('Order '||new.order_name||' — '||product.title,current_date) returning id into eid;
  insert into public.gallery_experiences(event_id,token_hash,enabled,closes_at,welcome,moderation,downloads,guest_limit,event_limit,upload_later)
   values(eid,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),false,now()+interval '1 year',
   'Your order is already purchased. Upload your photos, adjust each crop, and submit them when you are ready.',false,false,200,least(1000,n*3),true);
  insert into public.gallery_order_uploads(event_id,order_id,line_id,variant_id,order_name,product_title,quantity,required_count,email_error)
   values(eid,new.order_id,l->>'line_id',product.variant_id,new.order_name,product.title,(l->>'quantity')::integer,n,case when n>200 then 'Large order: contact the customer to arrange separate photo selections before production.' when (l->>'unit_cents')::integer<>product.unit_cents then 'Product price changed: review this paid order before sending its upload link.' else null end);
 end loop;
 return new;
end $$;
create or replace function public.gallery_later_check(p_id uuid) returns public.gallery_order_uploads language plpgsql security invoker set search_path='' as $$
declare u public.gallery_order_uploads; p public.gallery_payments; expected public.gallery_later_products;
begin
 select * into u from public.gallery_order_uploads where id=p_id;
 if not found or u.expires_at<=now() then raise exception 'Upload link unavailable' using errcode='PT403';end if;
 select * into p from public.gallery_payments where order_id=u.order_id for share;
 select * into expected from public.gallery_later_products where variant_id=u.variant_id;
 if u.required_count>200 or p.financial_status<>'paid' or p.cancelled or p.refund_activity or p.is_test or p.currency<>'USD'
 or not exists(select 1 from jsonb_array_elements(p.lines) l where l->>'line_id'=u.line_id and l->>'variant_id'=u.variant_id
 and l->>'upload_later'='true' and (l->>'quantity')::integer=u.quantity and (l->>'unit_cents')::integer=expected.unit_cents)
 or not exists(select 1 from public.gallery_events where id=u.event_id and active and deleted_at is null and purge_started_at is null)
 then raise exception 'Order needs review' using errcode='PT403';end if;
 return u;
end $$;

