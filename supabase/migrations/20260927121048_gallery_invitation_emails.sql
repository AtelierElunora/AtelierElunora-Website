-- No backfill or automatic sends: only a future owner invitation action creates a receipt.
create table public.gallery_invitation_emails (
 event_id uuid not null,
 email text not null,
 version uuid not null default gen_random_uuid(),
 expires_at timestamptz not null,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','accepted','failed','uncertain')),
 claim uuid,
 lease_until timestamptz,
 first_attempt_at timestamptz not null default now(),
 last_attempt_at timestamptz,
 accepted_at timestamptz,
 provider_id text,
 window_started_at timestamptz not null default now(),
 attempts integer not null default 0 check(attempts>=0),
 primary key(event_id,email),
 foreign key(event_id,email) references public.gallery_invitations(event_id,email) on delete cascade
);
alter table public.gallery_invitation_emails enable row level security;
revoke all on public.gallery_invitation_emails from public,anon,authenticated;
grant select(event_id,email,status,accepted_at,last_attempt_at) on public.gallery_invitation_emails to authenticated;
grant all on public.gallery_invitation_emails to service_role;
create policy owner_email_receipts on public.gallery_invitation_emails for select to authenticated using (
 (select gallery_private.session_active()) and (select auth.jwt()->>'aal')='aal2'
 and exists(select 1 from public.gallery_admins where user_id=(select auth.uid()))
);

-- Invoker + service-role-only EXECUTE. A browser cannot claim or manufacture sends.
-- Locking the existing invitation serializes concurrent claims for the same recipient.
create function public.gallery_invitation_email_claim(p_event uuid,p_email text,p_resend boolean,p_claim uuid,p_expires_at timestamptz,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 invitation public.gallery_invitations;
 delivery public.gallery_invitation_emails;
 new_message boolean;
begin
 select * into invitation from public.gallery_invitations where event_id=p_event and email=p_email for update;
 if not found or invitation.revoked or invitation.expires_at<=now()
  or not exists(select 1 from public.gallery_events where id=p_event and active and deleted_at is null)
 then return jsonb_build_object('status','unavailable'); end if;
 if invitation.expires_at is distinct from p_expires_at then return jsonb_build_object('status','changed'); end if;
 if p_claim is null or p_payload is null or p_payload#>>'{to,0}' is distinct from p_email then raise exception 'Invalid email preparation'; end if;
 select * into delivery from public.gallery_invitation_emails where event_id=p_event and email=p_email for update;
 if found then
  if delivery.lease_until>now() then return jsonb_build_object('status','busy'); end if;
  if delivery.status='accepted' and delivery.expires_at=invitation.expires_at and not p_resend then return jsonb_build_object('status','already_accepted'); end if;
  -- Never reuse an expired provider idempotency key for an ambiguous attempt.
  if delivery.status<>'accepted' and (delivery.first_attempt_at<now()-interval '23 hours' or delivery.expires_at<>invitation.expires_at)
   then return jsonb_build_object('status','review'); end if;
  if delivery.last_attempt_at>now()-interval '60 seconds' then return jsonb_build_object('status','cooldown'); end if;
  if delivery.window_started_at>now()-interval '1 hour' and delivery.attempts>=3 then return jsonb_build_object('status','limited'); end if;
  new_message:=delivery.status='accepted';
  update public.gallery_invitation_emails set
   version=case when new_message then gen_random_uuid() else version end,
   expires_at=case when new_message then invitation.expires_at else expires_at end,
   payload=case when new_message then p_payload else payload end,
   first_attempt_at=case when new_message then now() else first_attempt_at end,
   attempts=case when window_started_at<=now()-interval '1 hour' then 1 else attempts+1 end,
   window_started_at=case when window_started_at<=now()-interval '1 hour' then now() else window_started_at end,
   status='pending',claim=p_claim,lease_until=now()+interval '60 seconds',last_attempt_at=now(),accepted_at=null,provider_id=null
  where event_id=p_event and email=p_email returning * into delivery;
 else
  insert into public.gallery_invitation_emails(event_id,email,expires_at,payload,claim,lease_until,last_attempt_at,attempts)
  values(p_event,p_email,invitation.expires_at,p_payload,p_claim,now()+interval '60 seconds',now(),1) returning * into delivery;
 end if;
 return jsonb_build_object('status','send','delivery',jsonb_build_object('version',delivery.version,'payload',delivery.payload));
end;
$$;
revoke all on function public.gallery_invitation_email_claim(uuid,text,boolean,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.gallery_invitation_email_claim(uuid,text,boolean,uuid,timestamptz,jsonb) to service_role;
