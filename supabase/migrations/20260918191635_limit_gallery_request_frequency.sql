CREATE OR REPLACE FUNCTION public.snapshot_gallery_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare saved public.gallery_selections; item jsonb; checked_at timestamptz; hourly bigint; daily bigint;
begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Request snapshots are immutable';end if;
  return new;
 end if;
 if new.user_id is distinct from auth.uid() then raise exception 'Invalid requester';end if;
 if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
  raise exception 'Request creation requires read committed isolation';
 end if;
 select * into saved from public.gallery_selections where event_id=new.event_id and user_id=auth.uid() for update;
 if not found or saved.revision<>new.selection_revision or jsonb_array_length(saved.items)=0 then raise exception 'Save a nonempty current selection first';end if;
 -- Preserve the API's existing duplicate/retry reconciliation, even at the limit.
 if exists(select 1 from public.gallery_requests r where r.event_id=new.event_id and r.user_id=new.user_id and r.selection_revision=new.selection_revision) then
  raise unique_violation using message='Request already exists',constraint='gallery_requests_event_id_user_id_selection_revision_key';
 end if;
 checked_at=clock_timestamp();
 select count(*) filter(where r.created_at>checked_at-interval '1 hour'),count(*)
 into hourly,daily from public.gallery_requests r
 where r.user_id=new.user_id and r.event_id=new.event_id and r.created_at>checked_at-interval '24 hours';
 if hourly>=20 or daily>=100 then
  raise sqlstate 'PT429' using message='Too many new order requests. Your photos are saved. Please wait before starting another order.';
 end if;
 for item in select value from jsonb_array_elements(saved.items) loop
  if not exists(select 1 from public.gallery_photos p where p.id=(item->>'photoId')::uuid and p.event_id=new.event_id and p.ready and not p.hidden) then raise exception 'A selected photo is unavailable';end if;
 end loop;
 new.items=saved.items;new.status='submitted';new.created_at=checked_at;new.email=auth.jwt()->>'email';return new;
end;$function$
;
