-- Photo-scoped invitations. Service-only rows never expand event gallery RLS.
create table public.gallery_booth_invitations (
 id uuid primary key default gen_random_uuid(),
 station_id uuid not null references public.gallery_stations(id) on delete cascade,
 request_id uuid not null,
 photo_id uuid not null unique references public.gallery_photos(id) on delete cascade,
 event_id uuid not null references public.gallery_events(id) on delete cascade,
 channel text not null check(channel in ('email','sms')),
 recipient text not null check(length(recipient) between 3 and 254),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 link_token text check(link_token ~ '^[a-f0-9]{64}$'),
 consented_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '14 days',
 revoked boolean not null default false,
 claimed_by uuid references auth.users(id) on delete cascade,
 claimed_at timestamptz,
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed','uncertain')),
 lease_id uuid, lease_until timestamptz, first_attempt_at timestamptz,
 last_attempt_at timestamptz, attempts integer not null default 0,
 provider_id text,
 unique(station_id,request_id)
);
create index gallery_booth_recipient_window on public.gallery_booth_invitations(channel,recipient,created_at);
create index gallery_booth_station_window on public.gallery_booth_invitations(station_id,created_at);
create index gallery_booth_claimed on public.gallery_booth_invitations(claimed_by,expires_at) where claimed_by is not null;
alter table public.gallery_booth_invitations enable row level security;
revoke all on public.gallery_booth_invitations from public,anon,authenticated;
grant select,insert,update,delete on public.gallery_booth_invitations to service_role;

create function public.gallery_booth_prepare(p_hash text,p_request uuid,p_channel text,p_recipient text,p_token text,p_token_hash text,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.gallery_stations; i public.gallery_booth_invitations; pid uuid;
begin
 s=public.gallery_station_check(p_hash,'capture');
 -- Serialize creation and per-station limits even under concurrent requests.
 perform 1 from public.gallery_stations where id=s.id for update;
 select r.photo_id into pid from public.gallery_capture_receipts r join public.gallery_photos p on p.id=r.photo_id
 where r.station_id=s.id and r.request_id=p_request and p.event_id=s.event_id and p.ready and not p.hidden;
 if pid is null then raise exception 'Photo unavailable' using errcode='PT404'; end if;
 if p_channel is null or p_recipient is null or p_token is null or p_token_hash is null or p_lease is null or p_channel not in ('email','sms') or p_token !~ '^[a-f0-9]{64}$' or p_token_hash !~ '^[a-f0-9]{64}$'
 or (p_channel='email' and (length(p_recipient)>254 or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
 or (p_channel='sms' and p_recipient !~ '^\+[1-9][0-9]{7,14}$') then raise exception 'Invalid contact'; end if;
 select * into i from public.gallery_booth_invitations where photo_id=pid for update;
 if not found then
  -- A recipient lock also protects limits across different booths.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_channel||':'||p_recipient,0));
  if (select count(*) from public.gallery_booth_invitations where station_id=s.id and created_at>now()-interval '1 hour')>=100
  or (select count(*) from public.gallery_booth_invitations where channel=p_channel and recipient=p_recipient and created_at>now()-interval '1 day')>=10 then return jsonb_build_object('status','limited'); end if;
  insert into public.gallery_booth_invitations(station_id,request_id,photo_id,event_id,channel,recipient,token_hash,link_token)
  values(s.id,p_request,pid,s.event_id,p_channel,p_recipient,p_token_hash,p_token) returning * into i;
 end if;
 if i.channel<>p_channel or i.recipient<>p_recipient or i.station_id<>s.id or i.revoked or i.expires_at<=now() then return jsonb_build_object('status','unavailable'); end if;
 if i.claimed_by is not null or i.status='accepted' then return jsonb_build_object('status','accepted'); end if;
 if i.status='sending' and i.lease_until>now() then return jsonb_build_object('status','busy'); end if;
 -- SMS has no guaranteed provider idempotency. Never resend ambiguous sends.
 if i.channel='sms' and i.status in ('sending','uncertain') then return jsonb_build_object('status','review'); end if;
 if i.first_attempt_at<now()-interval '23 hours' or i.attempts>=3 then return jsonb_build_object('status','review'); end if;
 if i.last_attempt_at>now()-interval '60 seconds' then return jsonb_build_object('status','cooldown'); end if;
 update public.gallery_booth_invitations set status='sending',lease_id=p_lease,lease_until=now()+interval '2 minutes',
 first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),attempts=attempts+1 where id=i.id returning * into i;
 return jsonb_build_object('status','send','delivery',to_jsonb(i));
end $$;

create function public.gallery_booth_claim(p_token_hash text,p_user uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.gallery_booth_invitations; u auth.users;
begin
 select * into u from auth.users where id=p_user;
 if not found or (u.email_confirmed_at is null and u.phone_confirmed_at is null) or coalesce(u.is_anonymous,false) then raise exception 'Sign in required' using errcode='PT403'; end if;
 select * into i from public.gallery_booth_invitations where token_hash=p_token_hash for update;
 if not found or i.revoked or i.expires_at<=now() or (i.channel='email' and (u.email_confirmed_at is null or coalesce(lower(u.email),'')<>i.recipient))
 or (i.claimed_by is not null and i.claimed_by<>p_user) then raise exception 'Invitation unavailable' using errcode='PT403'; end if;
 if not exists(select 1 from public.gallery_events e join public.gallery_photos p on p.event_id=e.id where e.id=i.event_id and e.active and e.deleted_at is null and p.id=i.photo_id and p.ready and not p.hidden) then raise exception 'Photo unavailable' using errcode='PT403'; end if;
 update public.gallery_booth_invitations set claimed_by=p_user,claimed_at=coalesce(claimed_at,now()),link_token=null where id=i.id;
 return jsonb_build_object('claimed',true,'photoId',i.photo_id);
end $$;

create function public.gallery_booth_photos(p_user uuid,p_photo uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
 select p.id,p.event_id as "eventId",e.name as "eventName",p.filename,p.original_key,p.preview_key,p.original_bytes,p.preview_bytes,i.expires_at as "expiresAt"
 from public.gallery_booth_invitations i join public.gallery_photos p on p.id=i.photo_id join public.gallery_events e on e.id=i.event_id
 where i.claimed_by=p_user and not i.revoked and i.expires_at>now() and p.ready and not p.hidden and e.active and e.deleted_at is null
 and (p_photo is null or p.id=p_photo) order by i.claimed_at desc limit 100
 ) x;
$$;
revoke all on function public.gallery_booth_prepare(text,uuid,text,text,text,text,uuid),public.gallery_booth_claim(text,uuid),public.gallery_booth_photos(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gallery_booth_prepare(text,uuid,text,text,text,text,uuid),public.gallery_booth_claim(text,uuid),public.gallery_booth_photos(uuid,uuid) to service_role;
