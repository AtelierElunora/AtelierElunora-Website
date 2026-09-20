begin;
alter table public.gallery_print_jobs add column zoom numeric not null default 1 check(zoom between 1 and 3);
drop function public.gallery_print_update(text,uuid,integer,text,integer,numeric,numeric);
create function public.gallery_print_update(p_hash text,p_id uuid,p_version integer,p_action text,p_quantity integer default 1,p_x numeric default 50,p_y numeric default 50,p_zoom numeric default 1)
returns public.gallery_print_jobs language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; j public.gallery_print_jobs;
begin
 s=public.gallery_station_check(p_hash,'print');
 select * into j from public.gallery_print_jobs where id=p_id and event_id=s.event_id for update;
 if not found or j.version<>p_version then raise exception 'Queue changed; refresh first' using errcode='PT409'; end if;
 if p_action='claim' and j.status='pending' then
  j.status='printing'; j.quantity=p_quantity; j.x=p_x; j.y=p_y; j.zoom=p_zoom;
 elsif p_action='printed' and j.status='printing' then j.status='printed';
 elsif p_action='retry' and j.status in ('printing','held') then j.status='pending';
 elsif p_action='hold' and j.status='pending' then j.status='held';
 else raise exception 'Invalid print transition' using errcode='PT409'; end if;
 update public.gallery_print_jobs set status=j.status,quantity=j.quantity,x=j.x,y=j.y,zoom=j.zoom,version=version+1,updated_at=now() where id=j.id returning * into j;
 insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
 values('backend',s.actor_id,s.event_id,'station.print.'||p_action,'committed',j.id::text,jsonb_build_object('quantity',j.quantity,'version',j.version));
 return j;
end $$;
revoke all on function public.gallery_print_update(text,uuid,integer,text,integer,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.gallery_print_update(text,uuid,integer,text,integer,numeric,numeric,numeric) to service_role;
commit;
