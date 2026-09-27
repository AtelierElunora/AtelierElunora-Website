create or replace function public.gallery_guest_review(p_event uuid,p_photo uuid,p_action text)
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
  -- Approval queues one magnet only for event uploads, never unpaid commerce work.
  -- The upload row lock serializes review and manual queue requests.
  if p_action='approve' and u.status<>'approved'
   and exists(select 1 from public.gallery_experiences where event_id=p_event and studio_user is null and not upload_later)
   and not exists(select 1 from public.gallery_print_jobs where source_photo_id=p_photo) then
   insert into public.gallery_print_jobs(id,event_id,source_photo_id,quantity)
    values(p_photo,p_event,p_photo,1) on conflict(id) do nothing;
  end if;
  if p_action='reject' then update public.gallery_print_jobs set status='held',version=version+1 where source_photo_id=p_photo and status='pending'; end if;
 end if;
 return p_action;
end $$;

revoke all on function public.gallery_guest_review(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.gallery_guest_review(uuid,uuid,text) to service_role;

