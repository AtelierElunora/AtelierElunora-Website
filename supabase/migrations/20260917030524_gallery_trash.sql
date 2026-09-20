alter table public.gallery_events add column deleted_at timestamptz;
alter table public.gallery_events add constraint gallery_trash_guest_access_paused check (deleted_at is null or not active);
comment on column public.gallery_events.deleted_at is 'Recoverable owner deletion. Photos and orders remain stored. Restore leaves active false.';
