create table public.gallery_events(id uuid primary key default gen_random_uuid(),name text not null,event_date date not null,is_sample boolean not null default false,active boolean not null default true);
create table public.gallery_access(event_id uuid not null references public.gallery_events(id),user_id uuid not null references auth.users(id),expires_at timestamptz not null,revoked boolean not null default false,primary key(event_id,user_id));
create index gallery_access_user on public.gallery_access(user_id,event_id);
create table public.gallery_photos(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.gallery_events(id),filename text not null,sample_asset text not null check(sample_asset ~ '^photo-[1-8]\.jpg$'),position integer not null,hidden boolean not null default false);
create index gallery_photos_event on public.gallery_photos(event_id,position);
create table public.gallery_selections(event_id uuid not null references public.gallery_events(id),user_id uuid not null references auth.users(id),items jsonb not null default '[]',revision integer not null check(revision>0),updated_at timestamptz not null default now(),primary key(event_id,user_id));
create index gallery_selections_user on public.gallery_selections(user_id,event_id);
alter table public.gallery_events enable row level security;
alter table public.gallery_access enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.gallery_selections enable row level security;
revoke all on public.gallery_events,public.gallery_access,public.gallery_photos,public.gallery_selections from anon,authenticated;
grant select on public.gallery_events,public.gallery_access,public.gallery_photos,public.gallery_selections to authenticated;
grant insert,update on public.gallery_selections to authenticated;
create policy own_grant on public.gallery_access for select to authenticated using(user_id=(select auth.uid()) and not revoked and expires_at>now());
create policy assigned_event on public.gallery_events for select to authenticated using(active and exists(select 1 from public.gallery_access a where a.event_id=id));
create policy visible_photo on public.gallery_photos for select to authenticated using(not hidden and exists(select 1 from public.gallery_events e where e.id=event_id));
create policy own_selection_read on public.gallery_selections for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.gallery_events e where e.id=event_id));
create policy own_selection_insert on public.gallery_selections for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.gallery_events e where e.id=event_id));
create policy own_selection_update on public.gallery_selections for update to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.gallery_events e where e.id=event_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.gallery_events e where e.id=event_id));
create function public.validate_gallery_selection() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;seen uuid[]='{}';photo uuid;
begin
 if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items)>50 then raise exception 'Invalid selection'; end if;
 if tg_op='UPDATE' and (new.event_id<>old.event_id or new.user_id<>old.user_id or new.revision<>old.revision+1) then raise exception 'Invalid revision'; end if;
 if tg_op='INSERT' and new.revision<>1 then raise exception 'Invalid revision'; end if;
 for item in select value from jsonb_array_elements(new.items) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['photoId','quantity','x','y']) then raise exception 'Invalid photo';end if;
  photo=(item->>'photoId')::uuid;
  if photo=any(seen) or not exists(select 1 from public.gallery_photos p where p.id=photo and p.event_id=new.event_id and not p.hidden) then raise exception 'Unavailable photo'; end if;
  if jsonb_typeof(item->'quantity')<>'number' or (item->>'quantity')::numeric not between 1 and 12 or trunc((item->>'quantity')::numeric)<>(item->>'quantity')::numeric then raise exception 'Invalid quantity';end if;
  if jsonb_typeof(item->'x')<>'number' or jsonb_typeof(item->'y')<>'number' or (item->>'x')::numeric not between 0 and 100 or (item->>'y')::numeric not between 0 and 100 then raise exception 'Invalid crop';end if;
  seen=array_append(seen,photo);
 end loop;
 new.updated_at=now();return new;
end;$$;
revoke all on function public.validate_gallery_selection() from public,anon,authenticated;
create trigger validate_selection before insert or update on public.gallery_selections for each row execute function public.validate_gallery_selection();
