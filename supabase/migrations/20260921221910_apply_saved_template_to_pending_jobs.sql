-- Saved event defaults apply to queued work; printing/printed snapshots stay fixed.
create function public.apply_saved_template_to_pending_jobs()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.gallery_print_jobs
 set template=new.template,version=version+1,updated_at=now()
 where event_id=new.event_id and status='pending'
 and template is distinct from new.template;
 return new;
end $$;
revoke all on function public.apply_saved_template_to_pending_jobs() from public,anon,authenticated;
create trigger apply_saved_template_to_pending_jobs
 after insert or update of template on public.gallery_magnet_templates
 for each row execute function public.apply_saved_template_to_pending_jobs();

