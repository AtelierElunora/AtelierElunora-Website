-- Private privileged implementation needs Auth email-to-account lookup.
CREATE FUNCTION gallery_private.remove_guest_access(target_event uuid, guest_email text, guest_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE normalized_email text; account_ids uuid[]; invitation_count int; grant_count int;
BEGIN
  IF auth.uid() IS NULL OR NOT gallery_private.session_active()
     OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
     OR NOT EXISTS (SELECT 1 FROM public.gallery_admins WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Verified owner access required' USING ERRCODE='42501';
  END IF;
  IF (guest_email IS NULL) = (guest_user_id IS NULL) THEN
    RAISE EXCEPTION 'Choose one guest identifier' USING ERRCODE='22023';
  END IF;
  IF guest_email IS NOT NULL THEN
    normalized_email=lower(btrim(guest_email));
    IF length(normalized_email)>254 OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'Invalid guest email' USING ERRCODE='22023';
    END IF;
    SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO account_ids FROM auth.users WHERE lower(email)=normalized_email;
  ELSE
    SELECT lower(email) INTO normalized_email FROM auth.users WHERE id=guest_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Guest unavailable' USING ERRCODE='22023'; END IF;
    SELECT array_agg(id) INTO account_ids FROM auth.users WHERE id=guest_user_id OR lower(email)=normalized_email;
  END IF;
  IF EXISTS (SELECT 1 FROM public.gallery_admins WHERE user_id=ANY(account_ids)) THEN
    RAISE EXCEPTION 'Owner access cannot be removed as guest access' USING ERRCODE='22023';
  END IF;
  -- Serialize against existing access-write triggers, which lock this event FOR SHARE.
  PERFORM 1 FROM public.gallery_events WHERE id=target_event AND purge_started_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='22023'; END IF;
  UPDATE public.gallery_invitations SET revoked=true
    WHERE event_id=target_event AND lower(email)=normalized_email AND NOT revoked;
  GET DIAGNOSTICS invitation_count=ROW_COUNT;
  UPDATE public.gallery_access SET revoked=true
    WHERE event_id=target_event AND user_id=ANY(account_ids) AND NOT revoked;
  GET DIAGNOSTICS grant_count=ROW_COUNT;
  RETURN jsonb_build_object('removed',true,'invitationsRevoked',invitation_count,'grantsRevoked',grant_count);
END;
$$;
REVOKE ALL ON FUNCTION gallery_private.remove_guest_access(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION gallery_private.remove_guest_access(uuid,text,uuid) TO authenticated;
CREATE FUNCTION public.gallery_remove_guest_access(target_event uuid,guest_email text DEFAULT NULL,guest_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT gallery_private.remove_guest_access(target_event,guest_email,guest_user_id);
$$;
REVOKE ALL ON FUNCTION public.gallery_remove_guest_access(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gallery_remove_guest_access(uuid,text,uuid) TO authenticated;
