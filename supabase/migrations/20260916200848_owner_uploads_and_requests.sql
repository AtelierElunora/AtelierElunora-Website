-- Owner roles are provisioned administratively; clients cannot promote themselves.
create table public.gallery_admins(user_id uuid primary key references auth.users(id));
alter table public.gallery_admins enable row level security;
revoke all on public.gallery_admins from anon,authenticated;
grant select on public.gallery_admins to authenticated;
create policy own_admin on public.gallery_admins for select to authenticated using(user_id=(select auth.uid()));

create table public.gallery_invitations(
 event_id uuid not null references public.gallery_events(id),
 email text not null check(email=lower(trim(email)) and length(email)<=254),
 expires_at timestamptz not null, revoked boolean not null default false,
 primary key(event_id,email)
);
create index gallery_invitations_email on public.gallery_invitations(email,event_id);
alter table public.gallery_invitations enable row level security;
revoke all on public.gallery_invitations from anon,authenticated;
grant select,insert,update on public.gallery_invitations to authenticated;
create policy invited_email on public.gallery_invitations for select to authenticated using(email=lower((select auth.jwt()->>'email')) and not revoked and expires_at>now());
create policy owner_invitations on public.gallery_invitations for all to authenticated using(exists(select 1 from public.gallery_admins)) with check(exists(select 1 from public.gallery_admins));
grant insert,update on public.gallery_events to authenticated;
create policy owner_events on public.gallery_events for all to authenticated using(exists(select 1 from public.gallery_admins)) with check(exists(select 1 from public.gallery_admins));
drop policy assigned_event on public.gallery_events;
create policy assigned_event on public.gallery_events for select to authenticated using(active and (exists(select 1 from public.gallery_access a where a.event_id=id) or exists(select 1 from public.gallery_invitations i where i.event_id=id)));
grant update on public.gallery_access to authenticated;
create policy owner_access on public.gallery_access for all to authenticated using(exists(select 1 from public.gallery_admins)) with check(exists(select 1 from public.gallery_admins));

alter table public.gallery_photos alter column sample_asset drop not null;
alter table public.gallery_photos add column original_key text unique, add column preview_key text unique,
 add column original_bytes bigint not null default 0, add column preview_bytes bigint not null default 0,
 add column ready boolean not null default true;
alter table public.gallery_photos add constraint photo_source check(
 (sample_asset is not null and original_key is null and preview_key is null) or
 (sample_asset is null and original_key is not null and preview_key is not null));
grant insert,update,delete on public.gallery_photos to authenticated;
create policy owner_photos_read on public.gallery_photos for select to authenticated using(exists(select 1 from public.gallery_admins));
create policy owner_photos_insert on public.gallery_photos for insert to authenticated with check(exists(select 1 from public.gallery_admins));
create policy owner_photos_update on public.gallery_photos for update to authenticated using(exists(select 1 from public.gallery_admins)) with check(exists(select 1 from public.gallery_admins));
create policy owner_draft_delete on public.gallery_photos for delete to authenticated using(not ready and exists(select 1 from public.gallery_admins));
drop policy visible_photo on public.gallery_photos;
create policy visible_photo on public.gallery_photos for select to authenticated using(ready and not hidden and exists(select 1 from public.gallery_events e where e.id=event_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('gallery-originals','gallery-originals',false,15728640,array['image/jpeg','image/png','image/webp']),
 ('gallery-previews','gallery-previews',false,1048576,array['image/jpeg']);
create policy gallery_owner_storage_read on storage.objects for select to authenticated using(bucket_id in ('gallery-originals','gallery-previews') and exists(select 1 from public.gallery_admins));
create policy gallery_owner_storage_insert on storage.objects for insert to authenticated with check(
 exists(select 1 from public.gallery_admins) and exists(select 1 from public.gallery_photos p where not p.ready and
 ((bucket_id='gallery-originals' and p.original_key=name) or (bucket_id='gallery-previews' and p.preview_key=name))));
create policy gallery_owner_storage_delete on storage.objects for delete to authenticated using(
 exists(select 1 from public.gallery_admins) and exists(select 1 from public.gallery_photos p where not p.ready and
 ((bucket_id='gallery-originals' and p.original_key=name) or (bucket_id='gallery-previews' and p.preview_key=name))));
create policy gallery_guest_preview on storage.objects for select to authenticated using(bucket_id='gallery-previews' and exists(select 1 from public.gallery_photos p where p.preview_key=name and p.ready and not p.hidden));
-- Invoker rights preserve storage RLS; only an owner receives aggregate usage.
create function public.gallery_storage_usage() returns table(bucket_id text,bytes bigint,objects bigint)
 language sql stable security invoker set search_path='' as $$
 select o.bucket_id,coalesce(sum((o.metadata->>'size')::bigint),0)::bigint,count(*)
 from storage.objects o where o.bucket_id in ('gallery-originals','gallery-previews') and exists(select 1 from public.gallery_admins)
 group by o.bucket_id;
$$;
revoke all on function public.gallery_storage_usage() from public,anon;
grant execute on function public.gallery_storage_usage() to authenticated;

create table public.gallery_requests(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.gallery_events(id),
 user_id uuid not null references auth.users(id),email text not null default '',
 selection_revision integer not null,items jsonb not null default '[]',
 status text not null default 'submitted' check(status in ('submitted','preparing','ready','completed','cancelled')),
 created_at timestamptz not null default now(),
 unique(event_id,user_id,selection_revision)
);
create index gallery_requests_user on public.gallery_requests(user_id,event_id);
alter table public.gallery_requests enable row level security;
revoke all on public.gallery_requests from anon,authenticated;
grant select,insert on public.gallery_requests to authenticated;
grant update(status) on public.gallery_requests to authenticated;
create policy own_requests on public.gallery_requests for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.gallery_events e where e.id=event_id));
create policy submit_request on public.gallery_requests for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.gallery_events e where e.id=event_id));
create policy owner_requests_read on public.gallery_requests for select to authenticated using(exists(select 1 from public.gallery_admins));
create policy owner_requests_update on public.gallery_requests for update to authenticated using(exists(select 1 from public.gallery_admins)) with check(exists(select 1 from public.gallery_admins));
create function public.snapshot_gallery_request() returns trigger language plpgsql security invoker set search_path='' as $$
declare saved public.gallery_selections; item jsonb;
begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Request snapshots are immutable';end if;
  return new;
 end if;
 if new.user_id is distinct from auth.uid() then raise exception 'Invalid requester';end if;
 select * into saved from public.gallery_selections where event_id=new.event_id and user_id=auth.uid() for share;
 if not found or saved.revision<>new.selection_revision or jsonb_array_length(saved.items)=0 then raise exception 'Save a nonempty current selection first';end if;
 for item in select value from jsonb_array_elements(saved.items) loop
  if not exists(select 1 from public.gallery_photos p where p.id=(item->>'photoId')::uuid and p.event_id=new.event_id and p.ready and not p.hidden) then raise exception 'A selected photo is unavailable';end if;
 end loop;
 new.items=saved.items;new.status='submitted';new.created_at=now();new.email=auth.jwt()->>'email';return new;
end;$$;
revoke all on function public.snapshot_gallery_request() from public,anon,authenticated;
create trigger snapshot_request before insert or update on public.gallery_requests for each row execute function public.snapshot_gallery_request();
