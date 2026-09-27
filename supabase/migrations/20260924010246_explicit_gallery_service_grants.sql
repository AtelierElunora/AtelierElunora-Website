-- Preserve existing server CRUD access when rebuilding without automatic public-table grants.
-- Client permissions and row-level security are unchanged.
grant select, insert, update, delete on
 public.gallery_events,
 public.gallery_access,
 public.gallery_photos,
 public.gallery_selections,
 public.gallery_admins,
 public.gallery_invitations,
 public.gallery_requests
to service_role;