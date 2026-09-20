CREATE OR REPLACE FUNCTION public.validate_gallery_selection()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item jsonb;seen uuid[]='{}';photo uuid;
begin
 if new.items is null or jsonb_typeof(new.items) is distinct from 'array' then raise exception 'Invalid selection'; end if;
 if octet_length(new.items::text)>32768 then raise exception 'Selection exceeds the allowed size'; end if;
 if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items)>50 then raise exception 'Invalid selection'; end if;
 if tg_op='UPDATE' and (new.event_id<>old.event_id or new.user_id<>old.user_id or new.revision<>old.revision+1) then raise exception 'Invalid revision'; end if;
 if tg_op='INSERT' and new.revision<>1 then raise exception 'Invalid revision'; end if;
 for item in select value from jsonb_array_elements(new.items) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['photoId','quantity','x','y']) then raise exception 'Invalid photo';end if;
  if (item-array['photoId','quantity','x','y','zoom'])<>'{}'::jsonb then raise exception 'Unexpected selection fields';end if;
  if jsonb_typeof(item->'photoId') is distinct from 'string' then raise exception 'Invalid photo';end if;
  if item ? 'zoom' then
   if jsonb_typeof(item->'zoom') is distinct from 'number' then raise exception 'Invalid zoom';end if;
   if (item->>'zoom')::numeric not between 1 and 3 then raise exception 'Invalid zoom';end if;
  end if;
  photo=(item->>'photoId')::uuid;
  if photo=any(seen) or not exists(select 1 from public.gallery_photos p where p.id=photo and p.event_id=new.event_id and not p.hidden) then raise exception 'Unavailable photo'; end if;
  if jsonb_typeof(item->'quantity')<>'number' or (item->>'quantity')::numeric not between 1 and 12 or trunc((item->>'quantity')::numeric)<>(item->>'quantity')::numeric then raise exception 'Invalid quantity';end if;
  if jsonb_typeof(item->'x')<>'number' or jsonb_typeof(item->'y')<>'number' or (item->>'x')::numeric not between 0 and 100 or (item->>'y')::numeric not between 0 and 100 then raise exception 'Invalid crop';end if;
  seen=array_append(seen,photo);
 end loop;
 new.updated_at=now();return new;
end;$function$;
