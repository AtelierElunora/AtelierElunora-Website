alter table public.gallery_stations add column helper_only boolean not null default false;
create table public.gallery_print_helpers (
 id uuid primary key default gen_random_uuid(), station_id uuid not null unique references public.gallery_stations(id),
 event_id uuid not null references public.gallery_events(id), pair_hash text unique, pair_expires_at timestamptz,
 paired boolean not null default false, mode text not null default 'paused' check(mode in ('paused','running','ending','ended')),
 partial_seconds integer not null default 120 check(partial_seconds between 0 and 1800), flush boolean not null default false,
 heartbeat_at timestamptz, printer jsonb, attention text, created_at timestamptz not null default now()
);
create table public.gallery_helper_runs (
 id uuid primary key references public.gallery_print_runs(id), helper_id uuid not null references public.gallery_print_helpers(id),
 fence uuid not null default gen_random_uuid(), lease_until timestamptz not null default now()+interval '90 seconds',
 profile jsonb not null, allow_partial boolean not null default false, state text not null default 'active' check(state in ('active','completed','operator','released')),
 created_at timestamptz not null default now()
);
create table public.gallery_helper_sheets (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.gallery_helper_runs(id), sheet_index integer not null,
 items jsonb not null, state text not null default 'preparing' check(state in ('preparing','submitting','submitted','awaiting_confirmation','completed','attention','operator','released')),
 attempt_id uuid, artifact_hash text, spooler_job text, error text, updated_at timestamptz not null default now(),
 unique(run_id,sheet_index)
);
alter table public.gallery_print_helpers enable row level security;
alter table public.gallery_helper_runs enable row level security;
alter table public.gallery_helper_sheets enable row level security;
revoke all on public.gallery_print_helpers,public.gallery_helper_runs,public.gallery_helper_sheets from public,anon,authenticated;
grant all on public.gallery_print_helpers,public.gallery_helper_runs,public.gallery_helper_sheets to service_role;
create index gallery_print_helpers_event on public.gallery_print_helpers(event_id);
create index gallery_helper_runs_helper on public.gallery_helper_runs(helper_id);
alter table public.gallery_print_jobs add column reprint_of uuid references public.gallery_print_jobs(id);
create table public.gallery_helper_reprints (
 id uuid primary key, event_id uuid not null references public.gallery_events(id), sheet_id uuid not null references public.gallery_helper_sheets(id),
 reason text not null, created_at timestamptz not null default now()
);
alter table public.gallery_helper_reprints enable row level security;
revoke all on public.gallery_helper_reprints from public,anon,authenticated;
grant all on public.gallery_helper_reprints to service_role;

-- Existing manual clients cannot release or complete a helper-owned reservation.
alter function public.gallery_print_run(text,text,uuid,text) rename to gallery_print_run_manual;
create function public.gallery_print_run(p_hash text,p_action text,p_request uuid default null,p_profile text default 'letter') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations;
begin
 s=public.gallery_station_check(p_hash,'print');
 if exists(select 1 from public.gallery_helper_runs h join public.gallery_print_runs r on r.id=h.id where r.event_id=s.event_id and h.state='active') then
  raise exception 'Resolve the automatic print run in the owner dashboard first' using errcode='PT409';
 end if;
 return public.gallery_print_run_manual(p_hash,p_action,p_request,p_profile);
end $$;

create function public.gallery_helper_pair(p_code text,p_token text) returns uuid language plpgsql security invoker set search_path='' as $$
declare h public.gallery_print_helpers;
begin
 if p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid credential';end if;
 update public.gallery_print_helpers set paired=true,pair_hash=null where pair_hash=p_code and not paired and pair_expires_at>now() returning * into h;
 if not found then raise exception 'Pairing code expired or already used' using errcode='PT403';end if;
 update public.gallery_stations set token_hash=p_token where id=h.station_id and not revoked and expires_at>now();
 if not found then raise exception 'Pairing unavailable' using errcode='PT403';end if;
 return h.id;
end $$;

create function public.gallery_helper_step(p_hash text,p_action text,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare st public.gallery_stations; h public.gallery_print_helpers; r public.gallery_helper_runs; sh public.gallery_helper_sheets;
 data jsonb; item jsonb; copies jsonb='[]'; chunk jsonb; n integer; oldest timestamptz; idx integer=0; target uuid; desired text; capacity integer; paper text;
begin
 st=public.gallery_station_check(p_hash,'print');
 perform 1 from public.gallery_events where id=st.event_id for update;
 select * into h from public.gallery_print_helpers where station_id=st.id and paired for update;
 if not found then raise exception 'Helper unavailable' using errcode='PT403';end if;
 capacity=case when h.printer->>'id'='letter-four' then 4 else 6 end;paper=case when capacity=4 then 'letter' else '8x12' end;
 update public.gallery_print_helpers set heartbeat_at=now() where id=h.id;
 if p_action='heartbeat' then return jsonb_build_object('mode',h.mode,'attention',h.attention,'eventId',h.event_id,'confirmedSheets',(select coalesce(jsonb_agg(hs.id),'[]'::jsonb) from public.gallery_helper_sheets hs join public.gallery_helper_runs hr on hr.id=hs.run_id where hr.id=(p_body->>'runId')::uuid and hr.helper_id=h.id and hs.state='operator'),'runState',(select state from public.gallery_helper_runs where id=(p_body->>'runId')::uuid and helper_id=h.id));end if;
 select * into r from public.gallery_helper_runs where helper_id=h.id and state='active' for update;
 if p_action='claim' then
  if r.id is not null then
   return jsonb_build_object('recovery',true,'runId',r.id,'fence',r.fence,'profile',r.profile,'sheets',(select jsonb_agg(to_jsonb(x) order by sheet_index) from public.gallery_helper_sheets x where run_id=r.id));
  end if;
  if h.mode not in ('running','ending') or h.attention is not null then return jsonb_build_object('waiting',true);end if;
  if exists(select 1 from public.gallery_helper_runs x join public.gallery_print_runs pr on pr.id=x.id where pr.event_id=h.event_id and x.state='active') then raise exception 'Another helper owns the reserved run' using errcode='PT409';end if;
  select coalesce(sum(quantity),0),min(created_at) into n,oldest from public.gallery_print_jobs j
   where event_id=h.event_id and status='pending' and exists(select 1 from public.gallery_photos p where p.id=j.source_photo_id and p.ready and not p.hidden);
  if n=0 then
   if h.mode='ending' then update public.gallery_print_helpers set mode='ended' where id=h.id;end if;
   return jsonb_build_object('waiting',true,'copies',0);
  end if;
  if n<capacity and not h.flush and h.mode<>'ending' and (h.partial_seconds=0 or oldest+make_interval(secs=>h.partial_seconds)>now()) then return jsonb_build_object('waiting',true,'copies',n);end if;
  if h.printer is null then raise exception 'Calibrated printer profile required';end if;
  target=(p_body->>'requestId')::uuid;
  data=public.gallery_print_run(p_hash,'claim',target,paper);
  if data->'run' is null or data->'run'='null'::jsonb then return jsonb_build_object('waiting',true);end if;
  target=(data->'run'->>'id')::uuid;
  insert into public.gallery_helper_runs(id,helper_id,profile,allow_partial) values(target,h.id,h.printer,h.flush or h.mode='ending') returning * into r;
  for item in select value from jsonb_array_elements(data->'run'->'jobs') loop
   for n in 1..(item->>'quantity')::integer loop copies=copies||jsonb_build_array(item||coalesce(nullif(item->'print_crop','null'::jsonb),'{}'::jsonb)||jsonb_build_object('quantity',1));end loop;
  end loop;
  for n in 0..jsonb_array_length(copies)-1 by capacity loop
   select jsonb_agg(value order by ord) into chunk from jsonb_array_elements(copies) with ordinality a(value,ord) where ord>n and ord<=n+capacity;
   insert into public.gallery_helper_sheets(run_id,sheet_index,items) values(r.id,idx,chunk);idx=idx+1;
  end loop;
  update public.gallery_print_helpers set flush=false where id=h.id;
  return jsonb_build_object('runId',r.id,'fence',r.fence,'profile',r.profile,'sheets',(select jsonb_agg(to_jsonb(x) order by sheet_index) from public.gallery_helper_sheets x where run_id=r.id));
 end if;
 if r.id is null and p_action='report' and p_body->>'state'='completed' and exists(
  select 1 from public.gallery_helper_runs hr join public.gallery_helper_sheets hs on hs.run_id=hr.id where hr.helper_id=h.id and hr.id=(p_body->>'runId')::uuid and hr.fence=(p_body->>'fence')::uuid
   and hs.id=(p_body->>'sheetId')::uuid and hs.attempt_id=(p_body->>'attemptId')::uuid and hs.spooler_job=p_body->>'spoolerJob' and hs.state='completed'
 ) then return jsonb_build_object('saved',true);end if;
 if r.id is null or r.id is distinct from (p_body->>'runId')::uuid or r.fence is distinct from (p_body->>'fence')::uuid then raise exception 'Reservation fence changed' using errcode='PT409';end if;
 if p_action='renew' then
  update public.gallery_helper_runs set lease_until=now()+interval '90 seconds' where id=r.id;
  return jsonb_build_object('renewed',true);
 end if;
 select * into sh from public.gallery_helper_sheets where id=(p_body->>'sheetId')::uuid and run_id=r.id for update;
 if not found then raise exception 'Sheet unavailable' using errcode='PT409';end if;
 if p_action='submit' then
  if h.mode not in ('running','ending') or h.attention is not null or r.lease_until<=now() then raise exception 'Automatic printing paused or lease expired' using errcode='PT409';end if;
  if sh.state='submitting' and sh.attempt_id=(p_body->>'attemptId')::uuid and sh.artifact_hash=p_body->>'sha256' then return jsonb_build_object('authorized',true);end if;
  if sh.state<>'preparing' or exists(select 1 from public.gallery_helper_sheets where run_id=r.id and sheet_index<sh.sheet_index and state not in ('completed','operator')) then raise exception 'Resolve earlier sheet first' using errcode='PT409';end if;
  if jsonb_array_length(sh.items)<capacity and not r.allow_partial and not h.flush and h.mode<>'ending' then
   select min((value->>'created_at')::timestamptz) into oldest from jsonb_array_elements(sh.items);
   if h.partial_seconds=0 or oldest+make_interval(secs=>h.partial_seconds)>now() then return jsonb_build_object('waiting',true,'authorized',false);end if;
  end if;
  if h.flush then update public.gallery_helper_runs set allow_partial=true where id=r.id;update public.gallery_print_helpers set flush=false where id=h.id;end if;
  if coalesce(p_body->>'sha256','') !~ '^[a-f0-9]{64}$' or p_body->>'attemptId' is null then raise exception 'Artifact required';end if;
  perform public.gallery_print_run_manual(p_hash,'authorize',r.id,paper);
  update public.gallery_helper_sheets set state='submitting',attempt_id=(p_body->>'attemptId')::uuid,artifact_hash=p_body->>'sha256',updated_at=now() where id=sh.id;
  return jsonb_build_object('authorized',true);
 end if;
 if p_action='report' then
  desired=p_body->>'state';
  if sh.attempt_id is distinct from (p_body->>'attemptId')::uuid then raise exception 'Attempt changed' using errcode='PT409';end if;
  if desired='attention' then
   update public.gallery_helper_sheets set state='attention',error=left(p_body->>'error',300),updated_at=now() where id=sh.id and state not in ('completed','operator');
   update public.gallery_print_helpers set mode='paused',attention='Printer needs attention. Inspect the reserved sheet before continuing.' where id=h.id;
  elsif desired in ('submitted','completed','awaiting_confirmation') then
   if coalesce(p_body->>'spoolerJob','') !~ '^[A-Za-z0-9_.-]+-[0-9]+$' then raise exception 'Exact spooler job required';end if;
   if sh.spooler_job is not null and sh.spooler_job<>p_body->>'spoolerJob' then raise exception 'Spooler job changed';end if;
   if sh.state in ('completed','operator') then return jsonb_build_object('saved',true);end if;
   if sh.state not in ('submitting','submitted','awaiting_confirmation') then raise exception 'Inspect uncertain outcome' using errcode='PT409';end if;
   update public.gallery_helper_sheets set state=desired,error=case when desired='awaiting_confirmation' then 'Inspect this sheet and confirm it in the dashboard.' else null end,spooler_job=p_body->>'spoolerJob',updated_at=now() where id=sh.id;
   if desired='completed' and not exists(select 1 from public.gallery_helper_sheets where run_id=r.id and state not in ('completed','operator')) then
    perform public.gallery_print_run_manual(p_hash,'printed',r.id,paper);
    update public.gallery_print_jobs set completion_source=case when exists(select 1 from public.gallery_helper_sheets where run_id=r.id and state='operator') then 'operator' else 'computer' end where id in (select unnest(job_ids) from public.gallery_print_runs where id=r.id);
    update public.gallery_helper_runs set state='completed' where id=r.id;
    update public.gallery_print_helpers set mode='ended' where id=h.id and mode='ending';
   end if;
  else raise exception 'Invalid report';end if;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Invalid helper action';
end $$;
revoke all on function public.gallery_print_run(text,text,uuid,text),public.gallery_print_run_manual(text,text,uuid,text),public.gallery_helper_pair(text,text),public.gallery_helper_step(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.gallery_print_run(text,text,uuid,text),public.gallery_print_run_manual(text,text,uuid,text),public.gallery_helper_pair(text,text),public.gallery_helper_step(text,text,jsonb) to service_role;

create function public.gallery_helper_control(p_event uuid,p_action text,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare h public.gallery_print_helpers; r public.gallery_helper_runs; digest text; j public.gallery_print_jobs; item jsonb; sheet public.gallery_helper_sheets;
begin
 perform 1 from public.gallery_events where id=p_event for update;
 select * into h from public.gallery_print_helpers where id=(p_body->>'helperId')::uuid and event_id=p_event for update;
 if not found then raise exception 'Helper unavailable';end if;
 if p_action in ('start','pause','flush','end','revoke') then
  if p_action in ('start','end') and not exists(select 1 from public.gallery_stations where id=h.station_id and not revoked and expires_at>now()) then raise exception 'Pair a new helper; this credential expired or was disconnected';end if;
  if p_action='start' and (not h.paired or h.printer is null or exists(select 1 from public.gallery_helper_runs hr join public.gallery_helper_sheets hs on hs.run_id=hr.id where hr.helper_id=h.id and hr.state='active' and hs.state='attention')) then raise exception 'Pair, calibrate, and resolve attention first';end if;
  update public.gallery_print_helpers set mode=case p_action when 'start' then 'running' when 'pause' then 'paused' when 'end' then 'ending' when 'revoke' then 'ended' else mode end,
   flush=case when p_action in ('flush','end') then true else flush end,attention=case when p_action='start' then null else attention end where id=h.id;
  if p_action='revoke' then update public.gallery_stations set revoked=true where id=h.station_id;end if;
 elsif p_action='settings' then
  if h.mode not in ('paused','ended') then raise exception 'Pause before changing settings';end if;
  update public.gallery_print_helpers set partial_seconds=(p_body->>'partialSeconds')::integer where id=h.id;
 elsif p_action='confirm-sheet' then
  select * into r from public.gallery_helper_runs where id=(p_body->>'runId')::uuid and helper_id=h.id and state='active' for update;
  if not found or p_body->>'confirm' is distinct from 'true' then raise exception 'Confirm the physical sheet first';end if;
  select * into sheet from public.gallery_helper_sheets where id=(p_body->>'sheetId')::uuid and run_id=r.id for update;
  if not found or sheet.spooler_job is distinct from p_body->>'spoolerJob' or sheet.spooler_job is null then raise exception 'Exact sheet receipt required';end if;
  if sheet.state='operator' then return jsonb_build_object('saved',true);end if;
  if sheet.state<>'awaiting_confirmation' then raise exception 'This sheet is not waiting for confirmation';end if;
  update public.gallery_helper_sheets set state='operator',error=null,updated_at=now() where id=sheet.id;
  if not exists(select 1 from public.gallery_helper_sheets where run_id=r.id and state not in ('completed','operator')) then
   update public.gallery_print_jobs set status='printed',print_run_id=null,completion_source='operator',version=version+1,updated_at=now() where print_run_id=r.id and event_id=p_event;
   update public.gallery_print_runs set status='printed',finished_at=now() where id=r.id;
   update public.gallery_helper_runs set state='completed' where id=r.id;
   update public.gallery_print_helpers set mode='ended' where id=h.id and mode='ending';
  end if;
 elsif p_action='resolve' then
  select * into r from public.gallery_helper_runs where id=(p_body->>'runId')::uuid and helper_id=h.id and state='active' for update;
  if not found or p_body->>'confirm'<>'true' or p_body->>'outcome' not in ('printed','release') then raise exception 'Confirm the physical outcome first';end if;
  if p_body->>'outcome'='release' and exists(select 1 from public.gallery_helper_sheets where run_id=r.id and state<>'preparing') then raise exception 'Submission may have happened. Do not release this run; inspect and finish its remaining sheets manually.';end if;
  select token_hash into digest from public.gallery_stations where id=h.station_id;
  -- Owner reconciliation remains available after the helper expires or is revoked.
  update public.gallery_print_jobs set status=case when p_body->>'outcome'='printed' then 'printed' else 'pending' end,print_run_id=null,completion_source='operator',version=version+1,updated_at=now()
   where print_run_id=r.id and event_id=p_event;
  update public.gallery_print_runs set status=case when p_body->>'outcome'='printed' then 'printed' else 'released' end,finished_at=now() where id=r.id;
  update public.gallery_helper_runs set state=case when p_body->>'outcome'='printed' then 'operator' else 'released' end where id=r.id;
  update public.gallery_helper_sheets set state=case when p_body->>'outcome'='printed' then 'operator' else 'released' end,updated_at=now() where run_id=r.id and state not in ('completed','operator');
  update public.gallery_print_helpers set mode='paused',attention=null where id=h.id;
 elsif p_action='reprint' then
  select hs.* into sheet from public.gallery_helper_sheets hs join public.gallery_helper_runs hr on hr.id=hs.run_id
   where hs.id=(p_body->>'sheetId')::uuid and hr.helper_id=h.id and hr.state in ('completed','operator');
  if not found or sheet.state not in ('completed','operator') or length(trim(coalesce(p_body->>'reason',''))) not between 3 and 200 then raise exception 'Choose a completed sheet and enter a reprint reason';end if;
  if exists(select 1 from public.gallery_helper_reprints where id=(p_body->>'requestId')::uuid and event_id=p_event and sheet_id=sheet.id) then return jsonb_build_object('saved',true);end if;
  if p_body ? 'jobIds' and (jsonb_array_length(p_body->'jobIds')=0 or exists(select 1 from jsonb_array_elements_text(p_body->'jobIds') chosen where not exists(select 1 from jsonb_array_elements(sheet.items) i where i->>'id'=chosen))) then raise exception 'Selected photos must belong to this sheet';end if;
  insert into public.gallery_helper_reprints(id,event_id,sheet_id,reason) values((p_body->>'requestId')::uuid,p_event,sheet.id,trim(p_body->>'reason'));
  for item in select value from jsonb_array_elements(sheet.items) loop
   if p_body ? 'jobIds' and not (p_body->'jobIds' @> jsonb_build_array(item->>'id')) then continue;end if;
   select * into j from public.gallery_print_jobs where id=(item->>'id')::uuid and event_id=p_event;
   if not found or j.source_request_id is not null or j.source_order_upload_id is not null then raise exception 'This first automatic reprint flow supports event photos; use paid-order review for commerce reprints';end if;
   insert into public.gallery_print_jobs(id,event_id,source_photo_id,quantity,x,y,zoom,template,reprint_of)
    values(gen_random_uuid(),p_event,j.source_photo_id,1,(item->>'x')::numeric,(item->>'y')::numeric,(item->>'zoom')::numeric,item->'template',j.id);
  end loop;
 else raise exception 'Invalid owner action';end if;
 insert into public.gallery_activity_log(source,event_id,action,outcome,subject_reference,details) values('backend',p_event,'helper.'||p_action,'committed',h.id::text,p_body-array['token','code']);
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.gallery_helper_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gallery_helper_control(uuid,text,jsonb) to service_role;


