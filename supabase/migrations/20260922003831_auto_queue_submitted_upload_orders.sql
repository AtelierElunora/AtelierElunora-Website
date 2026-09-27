-- Saving a draft does not queue anything. Final submission and all print jobs commit together.
create or replace function public.gallery_later_save(p_session text,p_items jsonb,p_revision integer,p_submit boolean default false)
 returns public.gallery_order_uploads language plpgsql security invoker set search_path='' as $$
declare s public.gallery_guest_sessions; u public.gallery_order_uploads; item jsonb; seen uuid[]='{}'; photo uuid; total integer=0;
begin
 s=public.gallery_experience_check(p_session);
 select * into u from public.gallery_order_uploads where event_id=s.event_id for update;
 if not found then raise exception 'Order unavailable' using errcode='PT403';end if;
 perform public.gallery_later_check(u.id);
 if u.status<>'awaiting_photos' then
  if p_submit and p_items=u.items then
   if u.status='submitted' then
    perform public.gallery_later_produce(u.id);
    select * into u from public.gallery_order_uploads where id=u.id;
   end if;
   return u;
  end if;
  raise exception 'Photos already submitted' using errcode='PT409';
 end if;
 if u.revision<>p_revision then raise exception 'Selection changed. Reload saved photos.' using errcode='PT409';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>200 or octet_length(p_items::text)>65536 then raise exception 'Invalid selection';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['photoId','quantity','x','y','zoom']) or (item-array['photoId','quantity','x','y','zoom'])<>'{}'::jsonb then raise exception 'Invalid photo';end if;
  photo=(item->>'photoId')::uuid;
  if photo=any(seen) or not exists(select 1 from public.gallery_photos where id=photo and event_id=u.event_id and ready and not hidden) then raise exception 'Photo unavailable';end if;
  if jsonb_typeof(item->'quantity')<>'number' or (item->>'quantity')::numeric not between 1 and 12 or trunc((item->>'quantity')::numeric)<>(item->>'quantity')::numeric
   or jsonb_typeof(item->'x')<>'number' or jsonb_typeof(item->'y')<>'number' or jsonb_typeof(item->'zoom')<>'number'
   or (item->>'x')::numeric not between 0 and 100 or (item->>'y')::numeric not between 0 and 100 or (item->>'zoom')::numeric not between 1 and 3 then raise exception 'Invalid crop or copies';end if;
  total=total+(item->>'quantity')::integer;seen=array_append(seen,photo);
 end loop;
 if total>u.required_count or (p_submit and total<>u.required_count) then raise exception 'Choose the purchased number of magnets' using errcode='PT422';end if;
 update public.gallery_order_uploads set items=p_items,revision=revision+1,
 status=case when p_submit then 'submitted' else status end,submitted_at=case when p_submit then now() else submitted_at end
 where id=u.id returning * into u;
 if p_submit then
  perform public.gallery_later_produce(u.id);
  select * into u from public.gallery_order_uploads where id=u.id;
 end if;
 return u;
end $$;

