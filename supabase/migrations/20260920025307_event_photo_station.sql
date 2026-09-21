-- Event-scoped capabilities. Only the verified Edge Function can use these tables/RPCs.
create table public.gallery_stations (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.gallery_events(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64), purpose text not null check(purpose in ('capture','print')),
 expires_at timestamptz not null, revoked boolean not null default false,
 submitted integer not null default 0, last_capture_at timestamptz, created_at timestamptz not null default now()
);
create index gallery_stations_event on public.gallery_stations(event_id);
create table public.gallery_capture_receipts (
 station_id uuid not null references public.gallery_stations(id) on delete cascade,
 request_id uuid not null, photo_id uuid not null unique references public.gallery_photos(id) on delete cascade,
 digest text not null check(length(digest)=64), primary key(station_id,request_id)
);
create table public.gallery_print_jobs (
 id uuid primary key references public.gallery_photos(id) on delete cascade,
 event_id uuid not null references public.gallery_events(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','printing','printed','held')),
 quantity integer not null default 1 check(quantity between 1 and 12),
 x numeric not null default 50 check(x between 0 and 100), y numeric not null default 50 check(y between 0 and 100),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index gallery_print_jobs_queue on public.gallery_print_jobs(event_id,status,created_at,id);
alter table public.gallery_stations enable row level security;
alter table public.gallery_capture_receipts enable row level security;
alter table public.gallery_print_jobs enable row level security;
revoke all on public.gallery_stations,public.gallery_capture_receipts,public.gallery_print_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.gallery_stations,public.gallery_capture_receipts,public.gallery_print_jobs to service_role;

-- Invoker privileges: these functions do not elevate a caller. Execute is service-only.
create function public.gallery_station_check(p_hash text,p_purpose text)
returns public.gallery_stations language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations;
begin
 select * into s from public.gallery_stations where token_hash=p_hash and purpose=p_purpose for update;
 if not found or s.revoked or s.expires_at<=now() or not exists(select 1 from public.gallery_admins where user_id=s.actor_id) then raise exception 'Station unavailable' using errcode='PT403'; end if;
 perform 1 from public.gallery_events where id=s.event_id and deleted_at is null and purge_started_at is null for update;
 if not found then raise exception 'Event unavailable' using errcode='PT403'; end if;
 return s;
end $$;
create function public.gallery_capture_reserve(p_hash text,p_request uuid,p_digest text)
returns public.gallery_photos language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; r public.gallery_capture_receipts; p public.gallery_photos; key text;
begin
 s=public.gallery_station_check(p_hash,'capture');
 select * into r from public.gallery_capture_receipts where station_id=s.id and request_id=p_request;
 if found then
  if r.digest<>p_digest then raise exception 'Capture changed' using errcode='PT409'; end if;
  select * into p from public.gallery_photos where id=r.photo_id;
  -- Recover a capture finalized through the existing owner upload workflow.
  if p.ready then insert into public.gallery_print_jobs(id,event_id) values(p.id,s.event_id) on conflict(id) do nothing; end if;
  return p;
 end if;
 if s.submitted>=1000 or s.last_capture_at>now()-interval '3 seconds' then raise exception 'Capture limit reached' using errcode='PT429'; end if;
 p.id=gen_random_uuid(); key=s.event_id::text||'/'||p.id::text;
 insert into public.gallery_photos(id,event_id,filename,sample_asset,original_key,preview_key,position,ready,hidden)
 values(p.id,s.event_id,'Station-'||p.id::text||'.jpg',null,key||'/original.jpg',key||'/preview.jpg',extract(epoch from now())::integer,false,true) returning * into p;
 insert into public.gallery_capture_receipts values(s.id,p_request,p.id,p_digest);
 update public.gallery_stations set submitted=submitted+1,last_capture_at=now() where id=s.id;
 return p;
end $$;
create function public.gallery_capture_finish(p_hash text,p_request uuid,p_original_bytes integer,p_preview_bytes integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; pid uuid;
begin
 s=public.gallery_station_check(p_hash,'capture');
 select photo_id into pid from public.gallery_capture_receipts where station_id=s.id and request_id=p_request;
 if pid is null then raise exception 'Capture unavailable' using errcode='PT404'; end if;
 if p_original_bytes not between 1 and 4194304 or p_preview_bytes not between 1 and 1048576 then raise exception 'Invalid image size'; end if;
 update public.gallery_photos set ready=true,hidden=false,original_bytes=p_original_bytes,preview_bytes=p_preview_bytes where id=pid and not ready;
 insert into public.gallery_print_jobs(id,event_id) values(pid,s.event_id) on conflict(id) do nothing;
 return pid;
end $$;
create function public.gallery_print_update(p_hash text,p_id uuid,p_version integer,p_action text,p_quantity integer default 1,p_x numeric default 50,p_y numeric default 50)
returns public.gallery_print_jobs language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; j public.gallery_print_jobs;
begin
 s=public.gallery_station_check(p_hash,'print');
 select * into j from public.gallery_print_jobs where id=p_id and event_id=s.event_id for update;
 if not found or j.version<>p_version then raise exception 'Queue changed; refresh first' using errcode='PT409'; end if;
 if p_action='claim' and j.status='pending' then
  j.status='printing'; j.quantity=p_quantity; j.x=p_x; j.y=p_y;
 elsif p_action='printed' and j.status='printing' then j.status='printed';
 elsif p_action='retry' and j.status in ('printing','held') then j.status='pending';
 elsif p_action='hold' and j.status='pending' then j.status='held';
 else raise exception 'Invalid print transition' using errcode='PT409'; end if;
 update public.gallery_print_jobs set status=j.status,quantity=j.quantity,x=j.x,y=j.y,version=version+1,updated_at=now() where id=j.id returning * into j;
 insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
 values('backend',s.actor_id,s.event_id,'station.print.'||p_action,'committed',j.id::text,jsonb_build_object('quantity',j.quantity,'version',j.version));
 return j;
end $$;
revoke all on function public.gallery_station_check(text,text),public.gallery_capture_reserve(text,uuid,text),public.gallery_capture_finish(text,uuid,integer,integer),public.gallery_print_update(text,uuid,integer,text,integer,numeric,numeric) from public,anon,authenticated;
grant execute on function public.gallery_station_check(text,text),public.gallery_capture_reserve(text,uuid,text),public.gallery_capture_finish(text,uuid,integer,integer),public.gallery_print_update(text,uuid,integer,text,integer,numeric,numeric) to service_role;
