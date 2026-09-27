-- unified_guest_experience
-- Public QR capabilities are separate from private capture/print station credentials.
create table public.gallery_experiences (
 event_id uuid primary key references public.gallery_events(id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64),
 enabled boolean not null default true, closes_at timestamptz not null,
 welcome text not null default 'Share your celebration with Atelier Elunora.' check(length(welcome)<=500),
 moderation boolean not null default true, downloads boolean not null default true,
 guest_limit integer not null default 30 check(guest_limit between 1 and 200),
 event_limit integer not null default 2000 check(event_limit between 1 and 20000),
 reserved integer not null default 0, sessions integer not null default 0,
 studio_user uuid unique references auth.users(id), created_at timestamptz not null default now()
);
create table public.gallery_guest_sessions (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.gallery_experiences(event_id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64), link_hash text not null,
 user_id uuid references auth.users(id), reserved integer not null default 0,
 consent_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.gallery_guest_uploads (
 session_id uuid not null references public.gallery_guest_sessions(id) on delete cascade,
 request_id uuid not null, photo_id uuid not null unique references public.gallery_photos(id) on delete cascade,
 mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 15728640),
 status text not null default 'uploading' check(status in ('uploading','pending','approved','rejected')),
 primary key(session_id,request_id)
);
create index gallery_guest_sessions_event on public.gallery_guest_sessions(event_id);
alter table public.gallery_experiences enable row level security;
alter table public.gallery_guest_sessions enable row level security;
alter table public.gallery_guest_uploads enable row level security;
revoke all on public.gallery_experiences,public.gallery_guest_sessions,public.gallery_guest_uploads from public,anon,authenticated;
grant all on public.gallery_experiences,public.gallery_guest_sessions,public.gallery_guest_uploads to service_role;

create function public.gallery_experience_session(p_link text,p_token text,p_user uuid default null)
returns public.gallery_guest_sessions language plpgsql security invoker set search_path='' as $$
declare e public.gallery_experiences; s public.gallery_guest_sessions;
begin
 select * into e from public.gallery_experiences where token_hash=p_link for update;
 if not found or not e.enabled or e.closes_at<=now() or not exists(select 1 from public.gallery_events where id=e.event_id and active and deleted_at is null and purge_started_at is null) then raise exception 'Event closed' using errcode='PT403'; end if;
 if e.studio_user is not null and e.studio_user is distinct from p_user then raise exception 'Sign in to your workspace' using errcode='PT403'; end if;
 select * into s from public.gallery_guest_sessions where token_hash=p_token;
 if found then
  if s.event_id<>e.event_id or s.link_hash<>p_link then raise exception 'Session unavailable' using errcode='PT403'; end if;
  return s;
 end if;
 if e.sessions>=10000 then raise exception 'Event session limit reached' using errcode='PT429'; end if;
 insert into public.gallery_guest_sessions(event_id,token_hash,link_hash,user_id) values(e.event_id,p_token,p_link,p_user) returning * into s;
 update public.gallery_experiences set sessions=sessions+1 where event_id=e.event_id;
 return s;
end $$;

create function public.gallery_experience_check(p_token text)
returns public.gallery_guest_sessions language plpgsql security invoker set search_path='' as $$
declare s public.gallery_guest_sessions;
begin
 select s1.* into s from public.gallery_guest_sessions s1 join public.gallery_experiences e on e.event_id=s1.event_id join public.gallery_events ev on ev.id=e.event_id
 where s1.token_hash=p_token and s1.link_hash=e.token_hash and e.enabled and e.closes_at>now() and ev.active and ev.deleted_at is null and ev.purge_started_at is null;
 if not found then raise exception 'This event link has closed or changed' using errcode='PT403'; end if;
 return s;
end $$;

create function public.gallery_guest_reserve(p_token text,p_request uuid,p_filename text,p_mime text,p_bytes integer)
returns public.gallery_photos language plpgsql security invoker set search_path='' as $$
declare s public.gallery_guest_sessions; e public.gallery_experiences; u public.gallery_guest_uploads; p public.gallery_photos; ext text;
begin
 s=public.gallery_experience_check(p_token);
 select * into e from public.gallery_experiences where event_id=s.event_id for update;
 if e.token_hash<>s.link_hash or not e.enabled or e.closes_at<=now() then raise exception 'Event closed' using errcode='PT403'; end if;
 select * into s from public.gallery_guest_sessions where id=s.id for update;
 select * into u from public.gallery_guest_uploads where session_id=s.id and request_id=p_request;
 if found then
  select * into p from public.gallery_photos where id=u.photo_id;
  if u.mime<>p_mime or u.bytes<>p_bytes or p.filename<>p_filename then raise exception 'Upload changed' using errcode='PT409'; end if;
  return p;
 end if;
 if s.reserved>=e.guest_limit or e.reserved>=e.event_limit then raise exception 'Upload limit reached' using errcode='PT429'; end if;
 if length(p_filename) not between 1 and 180 or p_bytes not between 1 and 15728640 then raise exception 'Invalid photo'; end if;
 ext=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
 if ext is null then raise exception 'Unsupported photo'; end if;
 p.id=gen_random_uuid();
 insert into public.gallery_photos(id,event_id,filename,original_key,preview_key,position,ready,hidden)
 values(p.id,s.event_id,p_filename,s.event_id::text||'/'||p.id::text||'/original.'||ext,s.event_id::text||'/'||p.id::text||'/preview.jpg',extract(epoch from now())::integer,false,true) returning * into p;
 insert into public.gallery_guest_uploads values(s.id,p_request,p.id,p_mime,p_bytes,'uploading');
 update public.gallery_guest_sessions set reserved=reserved+1 where id=s.id;
 update public.gallery_experiences set reserved=reserved+1 where event_id=e.event_id;
 return p;
end $$;

create function public.gallery_guest_finish(p_token text,p_request uuid,p_preview_bytes integer)
returns text language plpgsql security invoker set search_path='' as $$
declare s public.gallery_guest_sessions; u public.gallery_guest_uploads; approval boolean;
begin
 s=public.gallery_experience_check(p_token);
 select * into u from public.gallery_guest_uploads where session_id=s.id and request_id=p_request for update;
 if not found then raise exception 'Upload unavailable'; end if;
 if u.status<>'uploading' then return u.status; end if;
 if p_preview_bytes not between 1 and 1048576 then raise exception 'Invalid preview'; end if;
 select not moderation into approval from public.gallery_experiences where event_id=s.event_id;
 update public.gallery_photos set ready=true,hidden=not approval,original_bytes=u.bytes,preview_bytes=p_preview_bytes where id=u.photo_id;
 update public.gallery_guest_uploads set status=case when approval then 'approved' else 'pending' end where photo_id=u.photo_id;
 return case when approval then 'approved' else 'pending' end;
end $$;

create function public.gallery_guest_review(p_event uuid,p_photo uuid,p_action text)
returns text language plpgsql security invoker set search_path='' as $$
declare u public.gallery_guest_uploads;
begin
 select u1.* into u from public.gallery_guest_uploads u1 join public.gallery_photos p on p.id=u1.photo_id where p.id=p_photo and p.event_id=p_event and p.ready for update of u1;
 if not found or p_action not in ('approve','reject','print') then raise exception 'Photo unavailable'; end if;
 if p_action='print' then
  if u.status<>'approved' then raise exception 'Approve this photo before printing'; end if;
  insert into public.gallery_print_jobs(id,event_id) values(p_photo,p_event) on conflict(id) do nothing;
 else
  if p_action='reject' and exists(select 1 from public.gallery_print_jobs where source_photo_id=p_photo and status='printing') then raise exception 'Resolve the reserved print first'; end if;
  update public.gallery_guest_uploads set status=case when p_action='approve' then 'approved' else 'rejected' end where photo_id=p_photo;
  update public.gallery_photos set hidden=p_action='reject' where id=p_photo;
  if p_action='reject' then update public.gallery_print_jobs set status='held',version=version+1 where source_photo_id=p_photo and status='pending'; end if;
 end if;
 return p_action;
end $$;

-- A signed-in online customer has exactly one private upload workspace.
create function public.gallery_studio_open(p_user uuid,p_link text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare eid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select event_id into eid from public.gallery_experiences where studio_user=p_user;
 if eid is null then
  insert into public.gallery_events(name,event_date) values('My photo magnets',current_date) returning id into eid;
  insert into public.gallery_experiences(event_id,token_hash,closes_at,studio_user,moderation,guest_limit,event_limit) values(eid,p_link,now()+interval '30 days',p_user,false,200,200);
 else
  if not exists(select 1 from public.gallery_events where id=eid and active and deleted_at is null and purge_started_at is null) then raise exception 'Workspace unavailable'; end if;
  update public.gallery_experiences set token_hash=p_link,closes_at=now()+interval '30 days',enabled=true where event_id=eid;
 end if;
 insert into public.gallery_access(event_id,user_id,expires_at) values(eid,p_user,now()+interval '30 days') on conflict(event_id,user_id) do update set expires_at=excluded.expires_at,revoked=false;
 return eid;
end $$;

revoke all on function public.gallery_experience_session(text,text,uuid),public.gallery_experience_check(text),public.gallery_guest_reserve(text,uuid,text,text,integer),public.gallery_guest_finish(text,uuid,integer),public.gallery_guest_review(uuid,uuid,text),public.gallery_studio_open(uuid,text) from public,anon,authenticated;
grant execute on function public.gallery_experience_session(text,text,uuid),public.gallery_experience_check(text),public.gallery_guest_reserve(text,uuid,text,text,integer),public.gallery_guest_finish(text,uuid,integer),public.gallery_guest_review(uuid,uuid,text),public.gallery_studio_open(uuid,text) to service_role;



-- unified_order_production
-- Separate jobs from photos: repeat orders must preserve prior production history.
alter table public.gallery_print_jobs add column source_photo_id uuid references public.gallery_photos(id) on delete cascade;
update public.gallery_print_jobs set source_photo_id=id;
alter table public.gallery_print_jobs alter column source_photo_id set not null;
create index gallery_print_jobs_source_photo on public.gallery_print_jobs(source_photo_id);
alter table public.gallery_print_jobs drop constraint gallery_print_jobs_id_fkey;
alter table public.gallery_print_jobs add column source_request_id uuid references public.gallery_requests(id);
create unique index gallery_print_jobs_order_photo on public.gallery_print_jobs(source_request_id,source_photo_id) where source_request_id is not null;
create function public.gallery_production_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' and new.source_photo_id is null then new.source_photo_id=new.id; end if;
 if not exists(select 1 from public.gallery_photos where id=new.source_photo_id and event_id=new.event_id) then raise exception 'Wrong event photo'; end if;
 if new.source_request_id is not null and (tg_op='INSERT' or new.status='printing') then
  if not exists(select 1 from public.gallery_requests r where r.id=new.source_request_id and r.event_id=new.event_id and r.status in ('submitted','preparing','ready')) then raise exception 'Order unavailable'; end if;
  if (select count(*) from public.gallery_payments gp cross join lateral jsonb_array_elements(gp.lines) l where l->>'request_id'=new.source_request_id::text)<>1 or not exists(
   select 1 from public.gallery_payments gp cross join lateral jsonb_array_elements(gp.lines) l where l->>'request_id'=new.source_request_id::text and l->>'match_status'='matched' and gp.financial_status='paid' and not gp.cancelled and not gp.refund_activity and not gp.is_test
  ) then raise exception 'Verified payment required' using errcode='PT409'; end if;
  if tg_op='UPDATE' and (new.quantity,new.x,new.y,new.zoom) is distinct from (old.quantity,old.x,old.y,old.zoom) then raise exception 'Paid order crop and quantity are fixed'; end if;
 end if;
 return new;
end $$;
create trigger gallery_production_guard before insert or update on public.gallery_print_jobs for each row execute function public.gallery_production_guard();
revoke all on function public.gallery_production_guard() from public,anon,authenticated;

create function public.gallery_order_produce(p_request uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare r public.gallery_requests; item jsonb; n integer=0; t jsonb;
begin
 select * into r from public.gallery_requests where id=p_request for update;
 if not found then raise exception 'Order unavailable'; end if;
 if not exists(select 1 from public.gallery_events where id=r.event_id and active and deleted_at is null and purge_started_at is null) then raise exception 'Event unavailable'; end if;
 select template into t from public.gallery_magnet_templates where event_id=r.event_id;
 for item in select value from jsonb_array_elements(r.items) loop
  if not exists(select 1 from public.gallery_photos where id=(item->>'photoId')::uuid and event_id=r.event_id and ready and not hidden) then raise exception 'Photo unavailable'; end if;
  if not exists(select 1 from public.gallery_print_jobs where source_request_id=r.id and source_photo_id=(item->>'photoId')::uuid) then
   insert into public.gallery_print_jobs(id,event_id,source_photo_id,source_request_id,quantity,x,y,zoom,template)
   values(gen_random_uuid(),r.event_id,(item->>'photoId')::uuid,r.id,(item->>'quantity')::integer,(item->>'x')::numeric,(item->>'y')::numeric,coalesce((item->>'zoom')::numeric,1),coalesce(t,'{"enabled":false,"photoCutInches":2.5,"cutInches":3.25}'::jsonb));
   n=n+1;
  end if;
 end loop;
 return n;
end $$;
revoke all on function public.gallery_order_produce(uuid) from public,anon,authenticated;
grant execute on function public.gallery_order_produce(uuid) to service_role;
create or replace function public.gallery_letter_claim(p_hash text,p_request uuid,p_template jsonb,p_partial boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; batch uuid; ids uuid[]; n integer; j public.gallery_print_jobs; t jsonb; cut numeric;
begin
 s=public.gallery_station_check(p_hash,'print');
 perform 1 from public.gallery_events where id=s.event_id for update;
 if p_request is null or p_partial is null then raise exception 'Invalid batch request' using errcode='PT422'; end if;
 select letter_batch_id into batch from public.gallery_print_jobs where event_id=s.event_id and letter_batch_id=p_request limit 1;
 if batch is null then select letter_batch_id into batch from public.gallery_print_jobs where event_id=s.event_id and status='printing' and letter_batch_id is not null limit 1; end if;
 if batch is not null then return jsonb_build_object('created',false,'id',batch,'jobs',(select jsonb_agg(to_jsonb(q) order by q.letter_slot) from public.gallery_print_jobs q where q.event_id=s.event_id and q.letter_batch_id=batch)); end if;
 select array_agg(q.id order by q.created_at,q.id) into ids from (
  select job.id,job.created_at from public.gallery_print_jobs job join public.gallery_photos p on p.id=job.source_photo_id and p.event_id=job.event_id
  where job.event_id=s.event_id and job.status='pending' and job.quantity=1 and job.letter_batch_id is null and p.ready and not p.hidden
  order by job.created_at,job.id limit 6 for update of job skip locked
 ) q;
 n=coalesce(array_length(ids,1),0);
 if n=0 or (n<6 and not p_partial) then return jsonb_build_object('waiting',true,'count',n); end if;
 for i in 1..n loop
  select * into j from public.gallery_print_jobs where id=ids[i];
  t=coalesce(j.template,p_template);
  cut=case when coalesce((t->>'enabled')::boolean,false) then (t->>'cutInches')::numeric else (t->>'photoCutInches')::numeric end;
  if t is null or cut is null or cut<2.5 or cut>3.6 then raise exception 'Six-up requires cut sizes at most 3.6 inches' using errcode='PT422'; end if;
  update public.gallery_print_jobs set status='printing',letter_batch_id=p_request,letter_slot=i-1,template=t,version=version+1,updated_at=now() where id=j.id;
 end loop;
 insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
 values('backend',s.actor_id,s.event_id,'station.letter.claim','committed',p_request::text,jsonb_build_object('photos',n));
 return jsonb_build_object('created',true,'id',p_request,'jobs',(select jsonb_agg(to_jsonb(q) order by q.letter_slot) from public.gallery_print_jobs q where q.event_id=s.event_id and q.letter_batch_id=p_request));
end $$;



-- sheet_profiles_and_completion
alter table public.gallery_print_jobs add column sheet_profile text not null default 'letter' check(sheet_profile in ('letter','8x12'));
alter table public.gallery_print_jobs add column completion_source text not null default 'operator' check(completion_source in ('operator','computer'));
alter table public.gallery_print_jobs add column spooler_job text;
create or replace function public.gallery_sheet_claim(p_hash text,p_request uuid,p_template jsonb,p_partial boolean,p_profile text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; batch uuid; ids uuid[]; n integer; j public.gallery_print_jobs; t jsonb; cut numeric;
begin
 if p_profile not in ('letter','8x12') or p_profile is null then raise exception 'Invalid paper profile'; end if;
 s=public.gallery_station_check(p_hash,'print');
 perform 1 from public.gallery_events where id=s.event_id for update;
 if p_request is null or p_partial is null then raise exception 'Invalid batch request' using errcode='PT422'; end if;
 select letter_batch_id into batch from public.gallery_print_jobs where event_id=s.event_id and letter_batch_id=p_request limit 1;
 if batch is null then select letter_batch_id into batch from public.gallery_print_jobs where event_id=s.event_id and status='printing' and letter_batch_id is not null limit 1; end if;
 if batch is not null then return jsonb_build_object('created',false,'id',batch,'jobs',(select jsonb_agg(to_jsonb(q) order by q.letter_slot) from public.gallery_print_jobs q where q.event_id=s.event_id and q.letter_batch_id=batch)); end if;
 select array_agg(q.id order by q.created_at,q.id) into ids from (
  select job.id,job.created_at from public.gallery_print_jobs job join public.gallery_photos p on p.id=job.source_photo_id and p.event_id=job.event_id
  where job.event_id=s.event_id and job.status='pending' and job.quantity=1 and job.letter_batch_id is null and p.ready and not p.hidden
  order by job.created_at,job.id limit 6 for update of job skip locked
 ) q;
 n=coalesce(array_length(ids,1),0);
 if n=0 or (n<6 and not p_partial) then return jsonb_build_object('waiting',true,'count',n); end if;
 for i in 1..n loop
  select * into j from public.gallery_print_jobs where id=ids[i];
  t=coalesce(j.template,p_template);
  cut=case when coalesce((t->>'enabled')::boolean,false) then (t->>'cutInches')::numeric else (t->>'photoCutInches')::numeric end;
  if t is null or cut is null or cut<2.5 or cut>(case when p_profile='8x12' then 3.75 else 3.6 end) then raise exception 'Cut size does not fit the selected sheet' using errcode='PT422'; end if;
  update public.gallery_print_jobs set status='printing',sheet_profile=p_profile,letter_batch_id=p_request,letter_slot=i-1,template=t,version=version+1,updated_at=now() where id=j.id;
 end loop;
 insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
 values('backend',s.actor_id,s.event_id,'station.letter.claim','committed',p_request::text,jsonb_build_object('photos',n));
 return jsonb_build_object('created',true,'id',p_request,'jobs',(select jsonb_agg(to_jsonb(q) order by q.letter_slot) from public.gallery_print_jobs q where q.event_id=s.event_id and q.letter_batch_id=p_request));
end $$;
create or replace function public.gallery_letter_claim(p_hash text,p_request uuid,p_template jsonb,p_partial boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select public.gallery_sheet_claim(p_hash,p_request,p_template,p_partial,'letter'); $$;
revoke all on function public.gallery_sheet_claim(text,uuid,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.gallery_sheet_claim(text,uuid,jsonb,boolean,text) to service_role;

create function public.gallery_helper_complete(p_hash text,p_batch uuid,p_job uuid,p_version integer,p_spooler text)
returns integer language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations;n integer;
begin
 s=public.gallery_station_check(p_hash,'print');
 if (p_batch is null)=(p_job is null) or p_spooler !~ '^[A-Za-z0-9_.-]+-[0-9]+$' or length(p_spooler)>180 then raise exception 'Invalid completion'; end if;
 if p_batch is not null then
  update public.gallery_print_jobs set status='printed',completion_source='computer',spooler_job=p_spooler,version=version+1,updated_at=now() where event_id=s.event_id and letter_batch_id=p_batch and status='printing';
 else
  update public.gallery_print_jobs set status='printed',completion_source='computer',spooler_job=p_spooler,version=version+1,updated_at=now() where event_id=s.event_id and id=p_job and version=p_version and letter_batch_id is null and status='printing';
 end if;
 get diagnostics n=row_count;
 if n=0 and not exists(select 1 from public.gallery_print_jobs where event_id=s.event_id and (letter_batch_id=p_batch or id=p_job) and status='printed' and completion_source='computer' and spooler_job=p_spooler) then raise exception 'Queue changed' using errcode='PT409'; end if;
 return n;
end $$;
revoke all on function public.gallery_helper_complete(text,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.gallery_helper_complete(text,uuid,uuid,integer,text) to service_role;

create function public.gallery_helper_authorize(p_hash text,p_batch uuid,p_job uuid,p_version integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; j public.gallery_print_jobs; n integer=0;
begin
 s=public.gallery_station_check(p_hash,'print');
 if (p_batch is null)=(p_job is null) then raise exception 'Invalid reservation'; end if;
 for j in select * from public.gallery_print_jobs where event_id=s.event_id and (letter_batch_id=p_batch or id=p_job) order by id for update loop
  if j.status<>'printing' or (p_job is not null and j.version is distinct from p_version) then raise exception 'Reservation changed'; end if;
  if p_batch is not null and j.sheet_profile<>'8x12' then raise exception 'Wrong paper profile'; end if;
  if not exists(select 1 from public.gallery_photos where id=j.source_photo_id and event_id=s.event_id and ready and not hidden) then raise exception 'Photo unavailable'; end if;
  -- Re-run the paid-order guard immediately before local printer submission.
  update public.gallery_print_jobs set status=status where id=j.id;
  n=n+1;
 end loop;
 if n=0 then raise exception 'Reservation unavailable'; end if;
 return true;
end $$;
revoke all on function public.gallery_helper_authorize(text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.gallery_helper_authorize(text,uuid,uuid,integer) to service_role;



-- owner_mfa_schema_parity
alter table public.gallery_admins add column if not exists mfa_required boolean not null default false;

-- owner_mfa_activation_parity
grant update (mfa_required) on public.gallery_admins to authenticated;
drop policy if exists owner_enable_mfa on public.gallery_admins;
create policy owner_enable_mfa on public.gallery_admins for update to authenticated
using (user_id = (select auth.uid()) and (select auth.jwt()->>'aal') = 'aal2')
with check (user_id = (select auth.uid()) and (select auth.jwt()->>'aal') = 'aal2' and mfa_required);


-- guest_service_permissions
-- Server-only privileges used by guest uploads, private workspaces and printing.
-- No browser role gains privileges; existing RLS remains enabled.
grant select on public.gallery_admins to service_role;
grant select, insert, update on public.gallery_events, public.gallery_photos, public.gallery_access to service_role;
grant select, update on public.gallery_requests to service_role;


-- rejected_guest_cleanup
alter table public.gallery_guest_uploads drop constraint gallery_guest_uploads_status_check;
alter table public.gallery_guest_uploads add constraint gallery_guest_uploads_status_check check(status in ('uploading','pending','approved','rejected','deleting'));
grant delete on public.gallery_photos to service_role;
create function public.gallery_guest_delete_begin(p_event uuid,p_photo uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare u public.gallery_guest_uploads; p public.gallery_photos;
begin
 select * into u from public.gallery_guest_uploads where photo_id=p_photo for update;
 if not found or u.status not in ('rejected','deleting') then raise exception 'Only rejected photos can be deleted'; end if;
 select * into p from public.gallery_photos where id=p_photo and event_id=p_event for update;
 if not found then raise exception 'Photo unavailable'; end if;
 if exists(select 1 from public.gallery_print_jobs where source_photo_id=p_photo) or exists(select 1 from public.gallery_requests r cross join lateral jsonb_array_elements(r.items) i where r.event_id=p_event and i->>'photoId'=p_photo::text) then raise exception 'Photo linked to printing or an order'; end if;
 update public.gallery_guest_uploads set status='deleting' where photo_id=p_photo;
 update public.gallery_photos set ready=false,hidden=true where id=p_photo;
 return jsonb_build_object('original_key',p.original_key,'preview_key',p.preview_key);
end $$;
revoke all on function public.gallery_guest_delete_begin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gallery_guest_delete_begin(uuid,uuid) to service_role;
create or replace function public.gallery_guest_reserve(p_token text,p_request uuid,p_filename text,p_mime text,p_bytes integer)
returns public.gallery_photos language plpgsql security invoker set search_path='' as $$
declare s public.gallery_guest_sessions; e public.gallery_experiences; u public.gallery_guest_uploads; p public.gallery_photos; ext text;
begin
 s=public.gallery_experience_check(p_token);
 select * into e from public.gallery_experiences where event_id=s.event_id for update;
 if e.token_hash<>s.link_hash or not e.enabled or e.closes_at<=now() then raise exception 'Event closed' using errcode='PT403'; end if;
 select * into s from public.gallery_guest_sessions where id=s.id for update;
 select * into u from public.gallery_guest_uploads where session_id=s.id and request_id=p_request;
 if found then
  if u.status='deleting' then raise exception 'Photo deletion in progress' using errcode='PT409'; end if;
  select * into p from public.gallery_photos where id=u.photo_id;
  if u.mime<>p_mime or u.bytes<>p_bytes or p.filename<>p_filename then raise exception 'Upload changed' using errcode='PT409'; end if;
  return p;
 end if;
 if s.reserved>=e.guest_limit or e.reserved>=e.event_limit then raise exception 'Upload limit reached' using errcode='PT429'; end if;
 if length(p_filename) not between 1 and 180 or p_bytes not between 1 and 15728640 then raise exception 'Invalid photo'; end if;
 ext=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
 if ext is null then raise exception 'Unsupported photo'; end if;
 p.id=gen_random_uuid();
 insert into public.gallery_photos(id,event_id,filename,original_key,preview_key,position,ready,hidden)
 values(p.id,s.event_id,p_filename,s.event_id::text||'/'||p.id::text||'/original.'||ext,s.event_id::text||'/'||p.id::text||'/preview.jpg',extract(epoch from now())::integer,false,true) returning * into p;
 insert into public.gallery_guest_uploads values(s.id,p_request,p.id,p_mime,p_bytes,'uploading');
 update public.gallery_guest_sessions set reserved=reserved+1 where id=s.id;
 update public.gallery_experiences set reserved=reserved+1 where event_id=e.event_id;
 return p;
end $$;



-- guest_repeat_print_queue
-- Each operator action gets its own job ID. Retries reuse that ID.
create function public.gallery_guest_queue(p_event uuid,p_photo uuid,p_request uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare u public.gallery_guest_uploads; existing public.gallery_print_jobs;
begin
 if p_request is null then raise exception 'Queue request required'; end if;
 select u1.* into u from public.gallery_guest_uploads u1 join public.gallery_photos p on p.id=u1.photo_id
 where p.id=p_photo and p.event_id=p_event and p.ready and not p.hidden for update of u1;
 if not found or u.status<>'approved' then raise exception 'Approve this photo before printing'; end if;
 insert into public.gallery_print_jobs(id,event_id,source_photo_id,quantity) values(p_request,p_event,p_photo,1) on conflict(id) do nothing;
 select * into existing from public.gallery_print_jobs where id=p_request;
 if existing.event_id<>p_event or existing.source_photo_id<>p_photo or existing.source_request_id is not null then raise exception 'Queue request conflict'; end if;
 return existing.id;
end $$;
revoke all on function public.gallery_guest_queue(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.gallery_guest_queue(uuid,uuid,uuid) to service_role;

