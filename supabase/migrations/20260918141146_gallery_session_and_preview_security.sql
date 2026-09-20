-- Gallery session and guest preview hardening. Applied atomically as a migration.
CREATE SCHEMA gallery_private;
REVOKE ALL ON SCHEMA gallery_private FROM PUBLIC;
GRANT USAGE ON SCHEMA gallery_private TO authenticated;

-- Auth owns session records. Return only whether the caller's own session exists;
-- never grant clients access to auth.sessions or accept a supplied user/session ID.
CREATE FUNCTION gallery_private.session_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.sessions AS s
    WHERE s.user_id = auth.uid()
      AND s.id = CASE
        WHEN (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (auth.jwt()->>'session_id')::uuid
        ELSE NULL
      END
      AND (s.not_after IS NULL OR s.not_after > now())
  );
$$;
REVOKE ALL ON FUNCTION gallery_private.session_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gallery_private.session_active() TO authenticated;

-- Deliberately non-privileged RPC for a clear 401 at the API boundary.
CREATE FUNCTION public.gallery_session_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT gallery_private.session_active(); $$;
REVOKE ALL ON FUNCTION public.gallery_session_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gallery_session_active() TO authenticated;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'gallery_admins','gallery_access','gallery_invitations','gallery_events',
    'gallery_photos','gallery_selections','gallery_requests','gallery_payments',
    'gallery_payment_events','gallery_payment_refunds'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY gallery_session_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT gallery_private.session_active())) WITH CHECK ((SELECT gallery_private.session_active()))',
      table_name
    );
  END LOOP;
END;
$$;

CREATE POLICY gallery_session_guard ON storage.objects
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  bucket_id NOT IN ('gallery-previews','gallery-originals','gallery-exports')
  OR (SELECT gallery_private.session_active())
)
WITH CHECK (
  bucket_id NOT IN ('gallery-previews','gallery-originals','gallery-exports')
  OR (SELECT gallery_private.session_active())
);

-- SELECT also authorizes signed URLs. Guests need only authenticated downloads.
-- Owner policies separately retain preview/original signing and upload support.
ALTER POLICY gallery_guest_preview ON storage.objects
USING (
  bucket_id = 'gallery-previews'
  AND storage.allow_only_operation('object.get_authenticated')
  AND EXISTS (
    SELECT 1 FROM public.gallery_photos p
    WHERE p.preview_key = objects.name AND p.ready AND NOT p.hidden
  )
);
