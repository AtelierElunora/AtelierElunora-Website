-- Operator crop adjustments preserve the customer's original selection and purchased copies.
alter table public.gallery_print_jobs add column print_crop jsonb;
create table public.gallery_print_runs (
 id uuid primary key, event_id uuid not null references public.gallery_events(id) on delete cascade,
 status text not null default 'active' check(status in ('active','printed','released')),
 profile text not null check(profile in ('letter','8x12')), job_ids uuid[] not null,
 created_at timestamptz not null default now(), finished_at timestamptz
);
alter table public.gallery_print_runs enable row level security;
revoke all on public.gallery_print_runs from public,anon,authenticated;
grant all on public.gallery_print_runs to service_role;
create unique index gallery_print_runs_active on public.gallery_print_runs(event_id) where status='active';
create index gallery_print_runs_event on public.gallery_print_runs(event_id);
alter table public.gallery_print_jobs add column print_run_id uuid references public.gallery_print_runs(id);
create index gallery_print_jobs_run on public.gallery_print_jobs(print_run_id) where print_run_id is not null;

create function public.gallery_print_run_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.print_run_id is not null and new.print_run_id is not null then
  raise exception 'Finish or release the multi-sheet print run first' using errcode='PT409';
 end if;
 return new;
end $$;
create trigger gallery_print_run_guard before update on public.gallery_print_jobs for each row execute function public.gallery_print_run_guard();

create function public.gallery_print_crop_save(p_hash text,p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; j public.gallery_print_jobs; item jsonb; seen uuid[]='{}'; n integer=0;
begin
 s=public.gallery_station_check(p_hash,'print');
 perform 1 from public.gallery_events where id=s.event_id for update;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Invalid selection';end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['id','version','x','y','zoom']) or (item-array['id','version','x','y','zoom'])<>'{}'::jsonb then raise exception 'Invalid adjustment';end if;
  select * into j from public.gallery_print_jobs where id=(item->>'id')::uuid and event_id=s.event_id for update;
  if not found or j.id=any(seen) or j.status<>'pending' or j.letter_batch_id is not null or j.print_run_id is not null or j.version is distinct from (item->>'version')::integer then raise exception 'Queue changed; reload before saving' using errcode='PT409';end if;
  if jsonb_typeof(item->'x')<>'number' or jsonb_typeof(item->'y')<>'number' or jsonb_typeof(item->'zoom')<>'number'
   or (item->>'x')::numeric not between 0 and 100 or (item->>'y')::numeric not between 0 and 100 or (item->>'zoom')::numeric not between 1 and 3 then raise exception 'Invalid crop';end if;
  if not exists(select 1 from public.gallery_photos where id=j.source_photo_id and event_id=s.event_id and ready and not hidden) then raise exception 'Photo unavailable';end if;
  update public.gallery_print_jobs set print_crop=item-array['id','version'],version=version+1,updated_at=now() where id=j.id;
  insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
  values('backend',s.actor_id,s.event_id,'station.crop.save','committed',j.id::text,jsonb_build_object('before',coalesce(j.print_crop,jsonb_build_object('x',j.x,'y',j.y,'zoom',j.zoom)),'after',item-array['id','version']));
  seen=array_append(seen,j.id);n=n+1;
 end loop;
 return jsonb_build_object('updated',n);
end $$;

create function public.gallery_print_run(p_hash text,p_action text,p_request uuid default null,p_profile text default 'letter') returns jsonb
language plpgsql security invoker set search_path='' as $$
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
   if p_profile is null or p_profile not in ('letter','8x12') then raise exception 'Invalid paper';end if;
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
end $$;
revoke all on function public.gallery_print_run_guard(),public.gallery_print_crop_save(text,jsonb),public.gallery_print_run(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.gallery_print_crop_save(text,jsonb),public.gallery_print_run(text,text,uuid,text) to service_role;

create or replace function public.gallery_print_update(p_hash text,p_id uuid,p_version integer,p_action text,p_quantity integer default 1,p_x numeric default 50,p_y numeric default 50,p_zoom numeric default 1,p_template jsonb default null)
returns public.gallery_print_jobs language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; j public.gallery_print_jobs;
begin
 s=public.gallery_station_check(p_hash,'print');
 select * into j from public.gallery_print_jobs where id=p_id and event_id=s.event_id for update;
 if not found or j.version<>p_version then raise exception 'Queue changed; refresh first' using errcode='PT409'; end if;
 if j.letter_batch_id is not null then raise exception 'Use the letter batch controls for this photo' using errcode='PT409'; end if;
 if p_action='claim' and j.status='pending' then
  j.status='printing'; if j.source_request_id is not null or j.source_order_upload_id is not null then
   if p_quantity<>j.quantity then raise exception 'Purchased copies cannot change';end if;
   j.print_crop=jsonb_build_object('x',p_x,'y',p_y,'zoom',p_zoom);
  else j.quantity=p_quantity; j.x=p_x; j.y=p_y; j.zoom=p_zoom;j.print_crop=null;end if; j.template=p_template;
 elsif p_action='printed' and j.status='printing' then j.status='printed';
 elsif p_action='retry' and j.status in ('printing','held') then j.status='pending';
 elsif p_action='hold' and j.status='pending' then j.status='held';
 else raise exception 'Invalid print transition' using errcode='PT409'; end if;
 update public.gallery_print_jobs set status=j.status,quantity=j.quantity,x=j.x,y=j.y,zoom=j.zoom,template=j.template,print_crop=j.print_crop,version=version+1,updated_at=now() where id=j.id returning * into j;
 insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
 values('backend',s.actor_id,s.event_id,'station.print.'||p_action,'committed',j.id::text,jsonb_build_object('quantity',j.quantity,'version',j.version));
 return j;
end $$;

