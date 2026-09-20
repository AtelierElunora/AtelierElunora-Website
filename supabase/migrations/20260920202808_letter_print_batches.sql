begin;
alter table public.gallery_print_jobs add column letter_batch_id uuid;
alter table public.gallery_print_jobs add column letter_slot smallint check(letter_slot between 0 and 5);
create unique index gallery_print_jobs_letter_slot on public.gallery_print_jobs(letter_batch_id,letter_slot) where letter_batch_id is not null;
create index gallery_print_jobs_letter_active on public.gallery_print_jobs(event_id,letter_batch_id) where status='printing' and letter_batch_id is not null;
create function public.gallery_letter_claim(p_hash text,p_request uuid,p_template jsonb,p_partial boolean default false)
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
  select job.id,job.created_at from public.gallery_print_jobs job join public.gallery_photos p on p.id=job.id and p.event_id=job.event_id
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
create function public.gallery_letter_finish(p_hash text,p_batch uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; n integer;
begin
 s=public.gallery_station_check(p_hash,'print');
 perform 1 from public.gallery_events where id=s.event_id for update;
 if p_action is null or p_action not in ('printed','release') then raise exception 'Invalid batch action' using errcode='PT409'; end if;
 perform 1 from public.gallery_print_jobs where event_id=s.event_id and letter_batch_id=p_batch order by id for update;
 if p_action='printed' then
  update public.gallery_print_jobs set status='printed',version=version+1,updated_at=now() where event_id=s.event_id and letter_batch_id=p_batch and status='printing';
 else
  update public.gallery_print_jobs set status='pending',letter_batch_id=null,letter_slot=null,version=version+1,updated_at=now() where event_id=s.event_id and letter_batch_id=p_batch and status='printing';
 end if;
 get diagnostics n=row_count;
 if n>0 then
  insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
  values('backend',s.actor_id,s.event_id,'station.letter.'||p_action,'committed',p_batch::text,jsonb_build_object('photos',n));
 end if;
 return jsonb_build_object('updated',n);
end $$;
revoke all on function public.gallery_letter_claim(text,uuid,jsonb,boolean),public.gallery_letter_finish(text,uuid,text) from public,anon,authenticated;
grant execute on function public.gallery_letter_claim(text,uuid,jsonb,boolean),public.gallery_letter_finish(text,uuid,text) to service_role;
create or replace function public.gallery_print_update(p_hash text,p_id uuid,p_version integer,p_action text,p_quantity integer default 1,p_x numeric default 50,p_y numeric default 50,p_zoom numeric default 1,p_template jsonb default null)
returns public.gallery_print_jobs language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; j public.gallery_print_jobs;
begin
 s=public.gallery_station_check(p_hash,'print');
 select * into j from public.gallery_print_jobs where id=p_id and event_id=s.event_id for update;
 if not found or j.version<>p_version then raise exception 'Queue changed; refresh first' using errcode='PT409'; end if;
 if j.letter_batch_id is not null then raise exception 'Use the letter batch controls for this photo' using errcode='PT409'; end if;
 if p_action='claim' and j.status='pending' then
  j.status='printing'; j.quantity=p_quantity; j.x=p_x; j.y=p_y; j.zoom=p_zoom; j.template=p_template;
 elsif p_action='printed' and j.status='printing' then j.status='printed';
 elsif p_action='retry' and j.status in ('printing','held') then j.status='pending';
 elsif p_action='hold' and j.status='pending' then j.status='held';
 else raise exception 'Invalid print transition' using errcode='PT409'; end if;
 update public.gallery_print_jobs set status=j.status,quantity=j.quantity,x=j.x,y=j.y,zoom=j.zoom,template=j.template,version=version+1,updated_at=now() where id=j.id returning * into j;
 insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
 values('backend',s.actor_id,s.event_id,'station.print.'||p_action,'committed',j.id::text,jsonb_build_object('quantity',j.quantity,'version',j.version));
 return j;
end $$;
commit;
