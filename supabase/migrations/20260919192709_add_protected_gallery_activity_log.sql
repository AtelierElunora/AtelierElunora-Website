-- Append-only application audit records. No FK: evidence survives event/user deletion.
create table public.gallery_activity_log (
 id uuid primary key default gen_random_uuid(),
 occurred_at timestamptz not null default clock_timestamp(),
 source text not null check (source in ('database','backend')),
 operation_id uuid,
 actor_user_id uuid,
 event_id uuid,
 action text not null check (length(action) between 1 and 80),
 outcome text not null check (outcome in ('committed','started','succeeded','rejected','incomplete','failed')),
 subject_reference text check (length(subject_reference)<=254),
 details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object' and octet_length(details::text)<=2048)
);
create index gallery_activity_log_time on public.gallery_activity_log (occurred_at desc,id);
create index gallery_activity_log_event_time on public.gallery_activity_log (event_id,occurred_at desc);
alter table public.gallery_activity_log enable row level security;
revoke all on public.gallery_activity_log from public,anon,authenticated,service_role;
grant select on public.gallery_activity_log to authenticated;
grant insert,select on public.gallery_activity_log to service_role;
create policy owner_read_activity on public.gallery_activity_log for select to authenticated using (
 (select gallery_private.session_active()) and (select auth.jwt()->>'aal')='aal2'
 and exists(select 1 from public.gallery_admins a where a.user_id=(select auth.uid()))
);
-- Trigger-only writer; never accepts caller-supplied SQL, row JSON, or actor IDs.
create function gallery_private.audit_gallery_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; previous jsonb; event_key uuid; subject text; label text; fields jsonb;
begin
 if tg_op='DELETE' then row_data=to_jsonb(old); else row_data=to_jsonb(new); end if;
 if tg_op='UPDATE' then previous=to_jsonb(old); end if;
 if tg_table_name='gallery_events' then
  event_key=(row_data->>'id')::uuid;
  if tg_op='UPDATE' and (previous->'active',previous->'deleted_at',previous->'purge_started_at',previous->'name',previous->'event_date') is not distinct from (row_data->'active',row_data->'deleted_at',row_data->'purge_started_at',row_data->'name',row_data->'event_date') then return null; end if;
  label=case when tg_op='INSERT' then 'event.created' when tg_op='DELETE' then 'event.deleted'
   when previous->'purge_started_at' is distinct from row_data->'purge_started_at' then 'event.purge_locked'
   when previous->'deleted_at' is distinct from row_data->'deleted_at' then case when row_data->>'deleted_at' is null then 'event.restored' else 'event.trashed' end
   when previous->'active' is distinct from row_data->'active' then case when (row_data->>'active')::boolean then 'event.access_enabled' else 'event.access_paused' end
   else 'event.updated' end;
  fields=jsonb_build_object('active',row_data->'active','trashed',row_data->>'deleted_at' is not null,'purge_started',row_data->>'purge_started_at' is not null);
 else
  event_key=(row_data->>'event_id')::uuid;
  subject=case when tg_table_name='gallery_invitations' then row_data->>'email' else row_data->>'user_id' end;
  if tg_op='UPDATE' and previous is not distinct from row_data then return null; end if;
  label=case when tg_table_name='gallery_invitations' then 'invitation.' else 'grant.' end || case when tg_op='INSERT' then 'created' when tg_op='DELETE' then 'deleted' when previous->'revoked' is distinct from row_data->'revoked' then case when (row_data->>'revoked')::boolean then 'revoked' else 'restored' end else 'updated' end;
  fields=jsonb_build_object('revoked',row_data->'revoked','expires_at',row_data->'expires_at','previous_revoked',previous->'revoked','previous_expires_at',previous->'expires_at');
 end if;
 insert into public.gallery_activity_log(source,actor_user_id,event_id,action,outcome,subject_reference,details)
 values('database',auth.uid(),event_key,label,'committed',subject,fields);
 return null;
end; $$;
revoke all on function gallery_private.audit_gallery_change() from public,anon,authenticated,service_role;
create trigger audit_gallery_event after insert or update or delete on public.gallery_events for each row execute function gallery_private.audit_gallery_change();
create trigger audit_gallery_invitation after insert or update or delete on public.gallery_invitations for each row execute function gallery_private.audit_gallery_change();
create trigger audit_gallery_grant after insert or update or delete on public.gallery_access for each row execute function gallery_private.audit_gallery_change();
