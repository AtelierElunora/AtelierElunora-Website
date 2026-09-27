create table public.gallery_later_products(
 variant_id text primary key, photo_count integer not null check(photo_count between 1 and 200),
 unit_cents integer not null check(unit_cents>0), title text not null
);
insert into public.gallery_later_products values
 ('52214559670560',25,8500,'After-Wedding Couple Magnet Collection'),
 ('52298480025888',30,22900,'Magnetic Keepsake Frame'),
 ('52298480058656',30,24900,'Magnetic Keepsake Frame'),
 ('52297952559392',30,27900,'Magnetic Keepsake Frame'),
 ('52298480091424',30,32900,'Magnetic Keepsake Frame'),
 ('52298480124192',30,22900,'Wedding Magnetic Keepsake Frame'),
 ('52298480156960',30,22900,'Wedding Magnetic Keepsake Frame'),
 ('52298480189728',30,22900,'Wedding Magnetic Keepsake Frame'),
 ('52298480222496',30,24900,'Wedding Magnetic Keepsake Frame'),
 ('52298480255264',30,24900,'Wedding Magnetic Keepsake Frame'),
 ('52298480288032',30,24900,'Wedding Magnetic Keepsake Frame'),
 ('52297952887072',30,27900,'Wedding Magnetic Keepsake Frame'),
 ('52297952919840',30,27900,'Wedding Magnetic Keepsake Frame'),
 ('52297952952608',30,27900,'Wedding Magnetic Keepsake Frame'),
 ('52298480320800',30,32900,'Wedding Magnetic Keepsake Frame'),
 ('52298480353568',30,32900,'Wedding Magnetic Keepsake Frame'),
 ('52298480386336',30,32900,'Wedding Magnetic Keepsake Frame');
alter table public.gallery_experiences add column upload_later boolean not null default false;
create table public.gallery_order_uploads(
 id uuid primary key default gen_random_uuid(),event_id uuid not null unique references public.gallery_events(id) on delete cascade,
 order_id text not null references public.gallery_payments(order_id),line_id text not null,variant_id text not null references public.gallery_later_products(variant_id),
 order_name text not null,product_title text not null,quantity integer not null check(quantity>0),
 required_count integer not null check(required_count between 1 and 200),
 status text not null default 'awaiting_photos' check(status in ('awaiting_photos','submitted','queued','completed')),
 items jsonb not null default '[]',revision integer not null default 0,
 token_hash text unique,expires_at timestamptz not null default now()+interval '1 year',
 submitted_at timestamptz,created_at timestamptz not null default now(),
 email_version integer not null default 1,email_sent_at timestamptz,email_attempted_at timestamptz,
 email_claim uuid,email_lease_until timestamptz,email_error text,email_recipient text,
 unique(order_id,line_id)
);
alter table public.gallery_later_products enable row level security;
alter table public.gallery_order_uploads enable row level security;
revoke all on public.gallery_later_products,public.gallery_order_uploads from public,anon,authenticated;
grant all on public.gallery_later_products,public.gallery_order_uploads to service_role;

-- Only authenticated Shopify deliveries populate this private order queue.
create function public.sync_order_photo_uploads() returns trigger language plpgsql security invoker set search_path='' as $$
declare l jsonb; product public.gallery_later_products; eid uuid; n integer;
begin
 if new.financial_status<>'paid' or new.cancelled or new.refund_activity or new.is_test or new.currency<>'USD' then return new;end if;
 for l in select value from jsonb_array_elements(new.lines) loop
  if l->>'upload_later' is distinct from 'true' then continue;end if;
  select * into product from public.gallery_later_products where variant_id=l->>'variant_id';
  if not found or (l->>'unit_cents')::integer<>product.unit_cents then continue;end if;
  n=(l->>'quantity')::integer*product.photo_count;
  if n not between 1 and 200 then continue;end if;
  if exists(select 1 from public.gallery_order_uploads where order_id=new.order_id and line_id=l->>'line_id') then continue;end if;
  insert into public.gallery_events(name,event_date) values('Order '||new.order_name||' — '||product.title,current_date) returning id into eid;
  insert into public.gallery_experiences(event_id,token_hash,enabled,closes_at,welcome,moderation,downloads,guest_limit,event_limit,upload_later)
   values(eid,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),false,now()+interval '1 year',
   'Your order is already purchased. Upload your photos, adjust each crop, and submit them when you are ready.',false,false,200,least(1000,n*3),true);
  insert into public.gallery_order_uploads(event_id,order_id,line_id,variant_id,order_name,product_title,quantity,required_count)
   values(eid,new.order_id,l->>'line_id',product.variant_id,new.order_name,product.title,(l->>'quantity')::integer,n);
 end loop;
 return new;
end $$;
create trigger sync_order_photo_uploads after insert or update on public.gallery_payments for each row execute function public.sync_order_photo_uploads();

create function public.gallery_later_check(p_id uuid) returns public.gallery_order_uploads language plpgsql security invoker set search_path='' as $$
declare u public.gallery_order_uploads; p public.gallery_payments; expected public.gallery_later_products;
begin
 select * into u from public.gallery_order_uploads where id=p_id;
 if not found or u.expires_at<=now() then raise exception 'Upload link unavailable' using errcode='PT403';end if;
 select * into p from public.gallery_payments where order_id=u.order_id for share;
 select * into expected from public.gallery_later_products where variant_id=u.variant_id;
 if p.financial_status<>'paid' or p.cancelled or p.refund_activity or p.is_test or p.currency<>'USD'
 or not exists(select 1 from jsonb_array_elements(p.lines) l where l->>'line_id'=u.line_id and l->>'variant_id'=u.variant_id
 and l->>'upload_later'='true' and (l->>'quantity')::integer=u.quantity and (l->>'unit_cents')::integer=expected.unit_cents)
 or not exists(select 1 from public.gallery_events where id=u.event_id and active and deleted_at is null and purge_started_at is null)
 then raise exception 'Order needs review' using errcode='PT403';end if;
 return u;
end $$;
create function public.gallery_later_link(p_id uuid,p_hash text) returns public.gallery_order_uploads language plpgsql security invoker set search_path='' as $$
declare u public.gallery_order_uploads;
begin
 u=public.gallery_later_check(p_id);
 if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid link';end if;
 update public.gallery_order_uploads set token_hash=p_hash where id=p_id returning * into u;
 update public.gallery_experiences set token_hash=p_hash,enabled=true,closes_at=u.expires_at where event_id=u.event_id;
 return u;
end $$;

create function public.gallery_later_save(p_session text,p_items jsonb,p_revision integer,p_submit boolean default false)
 returns public.gallery_order_uploads language plpgsql security invoker set search_path='' as $$
declare s public.gallery_guest_sessions; u public.gallery_order_uploads; item jsonb; seen uuid[]='{}'; photo uuid; total integer=0;
begin
 s=public.gallery_experience_check(p_session);
 select * into u from public.gallery_order_uploads where event_id=s.event_id for update;
 if not found then raise exception 'Order unavailable' using errcode='PT403';end if;
 perform public.gallery_later_check(u.id);
 if u.status<>'awaiting_photos' then
  if p_submit and p_items=u.items then return u;end if;
  raise exception 'Photos already submitted' using errcode='PT409';
 end if;
 if u.revision<>p_revision then raise exception 'Selection changed. Reload saved photos.' using errcode='PT409';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>200 or octet_length(p_items::text)>65536 then raise exception 'Invalid selection';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['photoId','quantity','x','y','zoom']) or (item-array['photoId','quantity','x','y','zoom'])<>'{}'::jsonb then raise exception 'Invalid photo';end if;
  photo=(item->>'photoId')::uuid;
  if photo=any(seen) or not exists(select 1 from public.gallery_photos where id=photo and event_id=u.event_id and ready and not hidden) then raise exception 'Photo unavailable';end if;
  if jsonb_typeof(item->'quantity')<>'number' or (item->>'quantity')::numeric not between 1 and 12 or trunc((item->>'quantity')::numeric)<>(item->>'quantity')::numeric
   or jsonb_typeof(item->'x')<>'number' or jsonb_typeof(item->'y')<>'number' or jsonb_typeof(item->'zoom')<>'number'
   or (item->>'x')::numeric not between 0 and 100 or (item->>'y')::numeric not between 0 and 100 or (item->>'zoom')::numeric not between 1 and 3 then raise exception 'Invalid crop or copies';end if;
  total=total+(item->>'quantity')::integer;seen=array_append(seen,photo);
 end loop;
 if total>u.required_count or (p_submit and total<>u.required_count) then raise exception 'Choose the purchased number of magnets' using errcode='PT422';end if;
 update public.gallery_order_uploads set items=p_items,revision=revision+1,
 status=case when p_submit then 'submitted' else status end,submitted_at=case when p_submit then now() else submitted_at end
 where id=u.id returning * into u;
 return u;
end $$;

alter table public.gallery_print_jobs add column source_order_upload_id uuid references public.gallery_order_uploads(id);
create unique index gallery_print_jobs_later_photo on public.gallery_print_jobs(source_order_upload_id,source_photo_id) where source_order_upload_id is not null;
create function public.gallery_later_print_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare u public.gallery_order_uploads;
begin
 if new.source_order_upload_id is not null then
  if new.source_request_id is not null then raise exception 'Ambiguous order';end if;
  if tg_op='INSERT' or new.status='printing' then
   u=public.gallery_later_check(new.source_order_upload_id);
   if u.event_id<>new.event_id or u.status not in ('submitted','queued','completed') then raise exception 'Submit photos first' using errcode='PT409';end if;
   if not exists(select 1 from jsonb_array_elements(u.items) i where i->>'photoId'=new.source_photo_id::text and
    (i->>'quantity')::integer=new.quantity and (i->>'x')::numeric=new.x and (i->>'y')::numeric=new.y and (i->>'zoom')::numeric=new.zoom) then raise exception 'Submitted crop is fixed';end if;
  end if;
 end if;
 return new;
end $$;
create trigger gallery_later_print_guard before insert or update on public.gallery_print_jobs for each row execute function public.gallery_later_print_guard();
create function public.gallery_later_produce(p_id uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare u public.gallery_order_uploads; item jsonb; t jsonb; n integer=0;
begin
 select * into u from public.gallery_order_uploads where id=p_id for update;
 u=public.gallery_later_check(p_id);
 if u.status not in ('submitted','queued') then raise exception 'Submit photos first' using errcode='PT409';end if;
 select template into t from public.gallery_magnet_templates where event_id=u.event_id;
 for item in select value from jsonb_array_elements(u.items) loop
  if not exists(select 1 from public.gallery_photos where id=(item->>'photoId')::uuid and event_id=u.event_id and ready and not hidden) then raise exception 'Photo unavailable';end if;
  insert into public.gallery_print_jobs(id,event_id,source_photo_id,source_order_upload_id,quantity,x,y,zoom,template)
   values(gen_random_uuid(),u.event_id,(item->>'photoId')::uuid,u.id,(item->>'quantity')::integer,(item->>'x')::numeric,(item->>'y')::numeric,(item->>'zoom')::numeric,
   coalesce(t,'{"enabled":false,"photoCutInches":2.5,"cutInches":3.25}'::jsonb))
   on conflict(source_order_upload_id,source_photo_id) where source_order_upload_id is not null do nothing;
  if found then n=n+1;end if;
 end loop;
 update public.gallery_order_uploads set status='queued' where id=u.id;
 return n;
end $$;

create function public.gallery_later_email_claim(p_id uuid,p_claim uuid,p_resend boolean default false) returns public.gallery_order_uploads language plpgsql security invoker set search_path='' as $$
declare u public.gallery_order_uploads; recipient text;
begin
 select * into u from public.gallery_order_uploads where id=p_id for update;
 perform public.gallery_later_check(p_id);
 if u.status<>'awaiting_photos' then return null;end if;
 if u.email_lease_until>now() then raise exception 'Email is being sent' using errcode='PT409';end if;
 if u.email_sent_at is not null and not p_resend then return null;end if;
 if p_resend and u.email_attempted_at>now()-interval '1 minute' then raise exception 'Wait before resending' using errcode='PT429';end if;
 -- Avoid automatic ambiguous retries after provider idempotency expires.
 if not p_resend and u.email_attempted_at<now()-interval '23 hours' then raise exception 'Owner resend required' using errcode='PT409';end if;
 select customer_email into recipient from public.gallery_payments where order_id=u.order_id;
 if recipient is null then raise exception 'Order has no email' using errcode='PT422';end if;
 update public.gallery_order_uploads set email_version=email_version+case when p_resend then 1 else 0 end,
 email_claim=p_claim,email_lease_until=now()+interval '1 minute',email_error=null,
 email_recipient=case when p_resend or email_recipient is null then recipient else email_recipient end,
 email_attempted_at=case when p_resend or email_attempted_at is null then now() else email_attempted_at end
 where id=p_id returning * into u;
 return u;
end $$;

revoke all on function public.sync_order_photo_uploads(),public.gallery_later_check(uuid),public.gallery_later_link(uuid,text),
 public.gallery_later_save(text,jsonb,integer,boolean),public.gallery_later_print_guard(),public.gallery_later_produce(uuid),public.gallery_later_email_claim(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.gallery_later_check(uuid),public.gallery_later_link(uuid,text),
 public.gallery_later_save(text,jsonb,integer,boolean),public.gallery_later_produce(uuid),public.gallery_later_email_claim(uuid,uuid,boolean) to service_role;

