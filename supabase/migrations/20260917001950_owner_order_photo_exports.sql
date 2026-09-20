-- Derived order files remain private. Only administratively provisioned owners
-- can create/read them; an explicitly generated signed URL is temporary access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gallery-exports','gallery-exports',false,15728640,array['image/jpeg']);
create policy "Owner reads gallery exports" on storage.objects for select to authenticated
using(bucket_id='gallery-exports' and exists(select 1 from public.gallery_admins where user_id=(select auth.uid())));
create policy "Owner creates gallery exports" on storage.objects for insert to authenticated
with check(bucket_id='gallery-exports' and exists(select 1 from public.gallery_admins where user_id=(select auth.uid())));

create or replace function public.gallery_storage_usage()
returns table(bucket_id text,bytes bigint,objects bigint)
language sql stable security invoker set search_path='' as $$
 select o.bucket_id,coalesce(sum((o.metadata->>'size')::bigint),0)::bigint,count(*)
 from storage.objects o
 where o.bucket_id in ('gallery-originals','gallery-previews','gallery-exports')
 and exists(select 1 from public.gallery_admins where user_id=(select auth.uid()))
 group by o.bucket_id;
$$;
