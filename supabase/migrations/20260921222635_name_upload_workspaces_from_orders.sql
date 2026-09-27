-- Track generated names so a later webhook never overwrites an owner's custom name.
alter table public.gallery_experiences add column order_workspace_name text;
create function public.name_upload_workspace_from_order()
returns trigger language plpgsql security invoker set search_path='' as $$
declare target uuid; current_name text; generated_name text; labels text[]; next_name text;
begin
 for target in
  select distinct r.event_id from jsonb_array_elements(new.lines) l
  join public.gallery_requests r on r.id::text=l->>'request_id'
  join public.gallery_experiences x on x.event_id=r.event_id
  where l->>'match_status'='matched' and x.studio_user is not null
  order by r.event_id
 loop
  select e.name,x.order_workspace_name into current_name,generated_name
   from public.gallery_events e join public.gallery_experiences x on x.event_id=e.id
   where e.id=target and e.deleted_at is null and e.purge_started_at is null for update of e;
  if not found or (current_name<>'My photo magnets' and current_name is distinct from generated_name) then continue;end if;
  select array_agg(q.label order by q.order_id) into labels from (
   select distinct p.order_id,coalesce(nullif(btrim(p.order_name),''),'#'||p.order_id) as label
   from public.gallery_payments p cross join lateral jsonb_array_elements(p.lines) l
   join public.gallery_requests r on r.id::text=l->>'request_id'
   where r.event_id=target and l->>'match_status'='matched'
  ) q;
  if cardinality(labels)>0 then
   next_name=case when cardinality(labels)=1 then 'Order ' else 'Orders ' end||array_to_string(labels,', ');
   update public.gallery_events set name=next_name where id=target and name is distinct from next_name;
   update public.gallery_experiences set order_workspace_name=next_name where event_id=target;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.name_upload_workspace_from_order() from public,anon,authenticated;
create trigger name_upload_workspace_from_order after insert or update of order_name,lines
 on public.gallery_payments for each row execute function public.name_upload_workspace_from_order();
-- Backfill existing linked customer workspaces through the same guarded rule.
update public.gallery_payments p set order_name=p.order_name where exists(
 select 1 from jsonb_array_elements(p.lines) l
 join public.gallery_requests r on r.id::text=l->>'request_id'
 join public.gallery_experiences x on x.event_id=r.event_id
 join public.gallery_events e on e.id=r.event_id
 where l->>'match_status'='matched' and x.studio_user is not null and e.name='My photo magnets'
);

