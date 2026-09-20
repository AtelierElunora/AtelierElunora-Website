alter table public.gallery_events add column if not exists purge_started_at timestamptz;

-- Service-only orchestration; authentication and owner checks happen in gallery-api.
-- Invoker privileges avoid exposing a security-definer route through public RPC.
create or replace function public.gallery_purge_inventory(target uuid)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'unknownExports',(select count(*) from storage.objects o where o.bucket_id='gallery-exports'
 and split_part(o.name,'/',1) not in (select id::text from gallery_events)
 and split_part(o.name,'/',1) not in (select id::text from gallery_requests)),
 'photoCount',(select count(*) from gallery_photos where event_id=target),
 'blockingRequests',(select count(*) from gallery_requests where event_id=target and status not in ('completed','cancelled')),
 'fileCount',(select count(*) from storage.objects o where o.bucket_id in ('gallery-originals','gallery-previews','gallery-exports') and
 (split_part(o.name,'/',1)=target::text or (o.bucket_id='gallery-exports' and split_part(o.name,'/',1) in (select id::text from gallery_requests where event_id=target)))),
 'bytes',(select coalesce(sum(coalesce((o.metadata->>'size')::bigint,0)),0) from storage.objects o where o.bucket_id in ('gallery-originals','gallery-previews','gallery-exports') and
 (split_part(o.name,'/',1)=target::text or (o.bucket_id='gallery-exports' and split_part(o.name,'/',1) in (select id::text from gallery_requests where event_id=target)))),
 'files',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select o.bucket_id,o.name from storage.objects o where o.bucket_id in ('gallery-originals','gallery-previews','gallery-exports') and
 (split_part(o.name,'/',1)=target::text or (o.bucket_id='gallery-exports' and split_part(o.name,'/',1) in (select id::text from gallery_requests where event_id=target))) order by o.bucket_id,o.name limit 200)x));
$$;
create or replace function public.gallery_begin_purge(target uuid, confirm_name text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e gallery_events;
begin
 select * into e from gallery_events where id=target for update;
 if not found then raise exception 'Event unavailable'; end if;
 if e.deleted_at is null or e.active or e.name is distinct from confirm_name then raise exception 'Trash the event and confirm its exact name'; end if;
 if e.deleted_at > now()-interval '135 minutes' then raise exception 'Recent upload links must expire before deletion'; end if;
 if (gallery_purge_inventory(target)->>'unknownExports')::bigint>0 then raise exception 'Unrecognized export paths require review'; end if;
 if exists(select 1 from gallery_requests where event_id=target and status not in ('completed','cancelled')) then raise exception 'Complete or cancel outstanding gallery requests first'; end if;
 update gallery_events set purge_started_at=coalesce(purge_started_at,now()) where id=target;
 return gallery_purge_inventory(target);
end; $$;
create or replace function public.gallery_finish_purge(target uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e gallery_events; inventory jsonb;
begin
 select * into e from gallery_events where id=target for update;
 if not found then return jsonb_build_object('deleted',true); end if;
 if e.purge_started_at is null or e.deleted_at is null or e.active then raise exception 'Deletion has not started'; end if;
 inventory=gallery_purge_inventory(target);
 if (inventory->>'fileCount')::bigint<>0 or (inventory->>'blockingRequests')::bigint<>0 then raise exception 'Files or open requests remain'; end if;
 delete from gallery_selections where event_id=target;
 delete from gallery_invitations where event_id=target;
 delete from gallery_access where event_id=target;
 delete from gallery_requests where event_id=target;
 delete from gallery_photos where event_id=target;
 delete from gallery_events where id=target;
 return jsonb_build_object('deleted',true);
end; $$;
-- Freeze a partially deleted gallery. Concurrent restore or new photo/selection
-- mutations must not race storage removal. Deletes are reserved for finalization.
create or replace function public.gallery_purge_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare locked_at timestamptz;
begin
 if tg_table_name='gallery_events' then
  if old.purge_started_at is not null and (new.active or new.deleted_at is null or new.purge_started_at is distinct from old.purge_started_at or new.name is distinct from old.name) then raise exception 'Permanent deletion in progress'; end if;
 else
  select purge_started_at into locked_at from gallery_events where id=new.event_id for share;
  if locked_at is not null then raise exception 'Permanent deletion in progress'; end if;
 end if;
 return new;
end; $$;
drop trigger if exists gallery_purge_guard on public.gallery_events;
create trigger gallery_purge_guard before update on public.gallery_events for each row execute function public.gallery_purge_guard();
do $$declare t text;begin
 foreach t in array array['gallery_photos','gallery_requests','gallery_selections','gallery_invitations','gallery_access'] loop
 execute format('drop trigger if exists gallery_purge_guard on public.%I',t);
 execute format('create trigger gallery_purge_guard before insert or update on public.%I for each row execute function public.gallery_purge_guard()',t);
 end loop;
end;$$;
revoke all on function public.gallery_purge_inventory(uuid),public.gallery_begin_purge(uuid,text),public.gallery_finish_purge(uuid),public.gallery_purge_guard() from public,anon,authenticated;
grant execute on function public.gallery_purge_inventory(uuid),public.gallery_begin_purge(uuid,text),public.gallery_finish_purge(uuid) to service_role;
