alter table public.gallery_print_jobs drop constraint gallery_print_jobs_sheet_profile_check;
alter table public.gallery_print_jobs add constraint gallery_print_jobs_sheet_profile_check check(sheet_profile in ('letter','8x12','4x6'));
alter table public.gallery_print_runs drop constraint gallery_print_runs_profile_check;
alter table public.gallery_print_runs add constraint gallery_print_runs_profile_check check(profile in ('letter','8x12','4x6'));
CREATE OR REPLACE FUNCTION public.gallery_print_run_manual(p_hash text, p_action text, p_request uuid DEFAULT NULL::uuid, p_profile text DEFAULT 'letter'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.gallery_stations; r public.gallery_print_runs; j public.gallery_print_jobs; ids uuid[]='{}'; total integer=0; t jsonb; fallback jsonb; cut numeric;
begin
 s=public.gallery_station_check(p_hash,'print');
 perform 1 from public.gallery_events where id=s.event_id for update;
 if p_action is null or p_action not in ('status','claim','printed','release','authorize') then raise exception 'Invalid action';end if;
 if p_action='status' then
  select * into r from public.gallery_print_runs where event_id=s.event_id and status='active';
 else
  if p_request is null then raise exception 'Request required';end if;
  select * into r from public.gallery_print_runs where id=p_request and event_id=s.event_id for update;
 end if;
 if p_action='claim' and r.id is null then
  select * into r from public.gallery_print_runs where event_id=s.event_id and status='active' for update;
  if r.id is null then
   if p_profile is null or p_profile not in ('letter','8x12','4x6') then raise exception 'Invalid paper';end if;
   if exists(select 1 from public.gallery_print_jobs where event_id=s.event_id and status='printing') then raise exception 'Finish the reserved photos first' using errcode='PT409';end if;
   select template into fallback from public.gallery_magnet_templates where event_id=s.event_id;
   fallback=coalesce(fallback,'{"enabled":false,"photoCutInches":2.5,"cutInches":3.25}'::jsonb);
   for j in select job.* from public.gallery_print_jobs job join public.gallery_photos p on p.id=job.source_photo_id and p.event_id=job.event_id
    where job.event_id=s.event_id and job.status='pending' and job.letter_batch_id is null and job.print_run_id is null and p.ready and not p.hidden
    order by job.created_at,job.id limit 200 for update of job loop
    if total+j.quantity>200 then exit;end if;
    t=coalesce(j.template,fallback);
    cut=case when coalesce((t->>'enabled')::boolean,false) then (t->>'cutInches')::numeric else (t->>'photoCutInches')::numeric end;
    if cut is null or cut<2.5 or cut>(case when p_profile='8x12' then 3.75 else 3.6 end) then raise exception 'Cut size does not fit the selected paper' using errcode='PT422';end if;
    ids=array_append(ids,j.id);total=total+j.quantity;
   end loop;
   if total=0 then return jsonb_build_object('run',null,'empty',true);end if;
   insert into public.gallery_print_runs(id,event_id,profile,job_ids) values(p_request,s.event_id,p_profile,ids) returning * into r;
   update public.gallery_print_jobs set status='printing',print_run_id=r.id,sheet_profile=p_profile,template=coalesce(template,fallback),version=version+1,updated_at=now() where id=any(ids) and event_id=s.event_id;
  end if;
 elsif p_action in ('printed','release','authorize') then
  if r.id is null then raise exception 'Print run unavailable' using errcode='PT409';end if;
  if r.status='active' then
   if p_action='authorize' then
    if (select count(*) from public.gallery_print_jobs q join public.gallery_photos p on p.id=q.source_photo_id and p.event_id=q.event_id
       where q.print_run_id=r.id and q.event_id=s.event_id and q.status='printing' and p.ready and not p.hidden)<>cardinality(r.job_ids) then
     raise exception 'Reserved photos changed or are unavailable' using errcode='PT409';
    end if;
    -- Recheck existing paid-order triggers immediately before each print attempt.
    update public.gallery_print_jobs set print_run_id=null where print_run_id=r.id and event_id=s.event_id;
    update public.gallery_print_jobs set print_run_id=r.id where id=any(r.job_ids) and event_id=s.event_id and status='printing';
   else
    update public.gallery_print_jobs set status=case when p_action='printed' then 'printed' else 'pending' end,print_run_id=null,version=version+1,updated_at=now() where print_run_id=r.id and event_id=s.event_id;
    update public.gallery_print_runs set status=case when p_action='printed' then 'printed' else 'released' end,finished_at=now() where id=r.id returning * into r;
   end if;
  elsif p_action='authorize' then raise exception 'Print run already finished' using errcode='PT409';end if;
 end if;
 if r.id is null then return jsonb_build_object('run',null);end if;
 if p_action<>'status' then
  insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details) values('backend',s.actor_id,s.event_id,'station.run.'||p_action,'committed',r.id::text,jsonb_build_object('photos',cardinality(r.job_ids)));
 end if;
 return jsonb_build_object('run',to_jsonb(r)||jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(q) order by array_position(r.job_ids,q.id)) from public.gallery_print_jobs q where q.id=any(r.job_ids) and q.event_id=s.event_id),'[]'::jsonb)));
end $function$
;
CREATE OR REPLACE FUNCTION public.gallery_helper_step(p_hash text, p_action text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare st public.gallery_stations; h public.gallery_print_helpers; r public.gallery_helper_runs; sh public.gallery_helper_sheets;
 data jsonb; item jsonb; copies jsonb='[]'; chunk jsonb; n integer; oldest timestamptz; idx integer=0; target uuid; desired text; capacity integer; paper text;
begin
 st=public.gallery_station_check(p_hash,'print');
 perform 1 from public.gallery_events where id=st.event_id for update;
 select * into h from public.gallery_print_helpers where station_id=st.id and paired for update;
 if not found then raise exception 'Helper unavailable' using errcode='PT403';end if;
 capacity=case h.printer->>'id' when 'photo-4x6-single' then 1 when 'letter-four' then 4 else 6 end;paper=case capacity when 1 then '4x6' when 4 then 'letter' else '8x12' end;
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
end $function$
;