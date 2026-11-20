-- CAMPORA Storage access policies.
-- Buckets remain private. Upload paths must begin with the authenticated user's UUID.
-- Public content is served only by time-limited signed URLs for objects linked to
-- approved content rows; allow_any_operation excludes object listing.

drop policy if exists campora_upload_own_files on storage.objects;
create policy campora_upload_own_files
on storage.objects
for insert to authenticated
with check (
  bucket_id in ('avatars', 'academic-resources', 'marketplace-images', 'lost-found-images', 'support-attachments')
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists campora_read_own_files on storage.objects;
create policy campora_read_own_files
on storage.objects
for select to authenticated
using (
  bucket_id in ('avatars', 'academic-resources', 'marketplace-images', 'lost-found-images', 'support-attachments')
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- A failed database insert may leave an unreferenced upload. Only its owner may
-- clean up that orphan; files attached to published/private records stay intact.
drop policy if exists campora_delete_own_orphaned_files on storage.objects;
create policy campora_delete_own_orphaned_files
on storage.objects
for delete to authenticated
using (
  bucket_id in ('avatars', 'academic-resources', 'marketplace-images', 'lost-found-images', 'support-attachments')
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not exists (
    select 1 from public.profiles p where p.avatar_path = storage.objects.name
  )
  and not exists (
    select 1 from public.academic_resources r where r.storage_path = storage.objects.name
  )
  and not exists (
    select 1 from public.marketplace_listings l where l.image_paths @> jsonb_build_array(storage.objects.name)
  )
  and not exists (
    select 1 from public.lost_found_items i where i.image_path = storage.objects.name
  )
  and not exists (
    select 1 from public.support_tickets t where t.attachment_paths @> jsonb_build_array(storage.objects.name)
  )
);

-- Private buckets do not permit direct public URLs. These fetch-only policies
-- let the app mint expiring signed URLs for approved campus content. They do not
-- permit listing objects or unrestricted reads of pending/unlinked submissions.
drop policy if exists campora_fetch_approved_academic_resources on storage.objects;
create policy campora_fetch_approved_academic_resources
on storage.objects
for select to public
using (
  bucket_id = 'academic-resources'
  and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
  and exists (
    select 1
    from public.academic_resources r
    where r.storage_path = storage.objects.name
      and (r.status = 'approved' or r.contributor_id = (select auth.uid()) or public.is_moderator_or_admin())
  )
);

drop policy if exists campora_fetch_approved_marketplace_images on storage.objects;
create policy campora_fetch_approved_marketplace_images
on storage.objects
for select to public
using (
  bucket_id = 'marketplace-images'
  and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
  and exists (
    select 1
    from public.marketplace_listings l
    where l.image_paths @> jsonb_build_array(storage.objects.name)
      and (l.status = 'approved' or l.seller_id = (select auth.uid()) or public.is_moderator_or_admin())
  )
);

drop policy if exists campora_fetch_approved_lost_found_images on storage.objects;
create policy campora_fetch_approved_lost_found_images
on storage.objects
for select to public
using (
  bucket_id = 'lost-found-images'
  and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
  and exists (
    select 1
    from public.lost_found_items i
    where i.image_path = storage.objects.name
      and (i.status = 'approved' or i.reporter_id = (select auth.uid()) or public.is_moderator_or_admin())
  )
);

-- A profile picture is only fetchable when the profile itself is public and active,
-- or when the caller is that profile owner/admin. No avatar bucket listing is exposed.
drop policy if exists campora_fetch_visible_avatars on storage.objects;
create policy campora_fetch_visible_avatars
on storage.objects
for select to public
using (
  bucket_id = 'avatars'
  and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
  and exists (
    select 1
    from public.profiles p
    where p.avatar_path = storage.objects.name
      and ((p.is_active and p.is_public) or p.id = (select auth.uid()) or public.is_admin())
  )
);

-- Support files are never public; only the ticket owner and moderators/admins
-- may mint an expiring URL for an attachment linked to a ticket.
drop policy if exists campora_fetch_support_attachments on storage.objects;
create policy campora_fetch_support_attachments
on storage.objects
for select to authenticated
using (
  bucket_id = 'support-attachments'
  and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
  and exists (
    select 1
    from public.support_tickets t
    where t.attachment_paths @> jsonb_build_array(storage.objects.name)
      and (t.requester_id = (select auth.uid()) or public.is_moderator_or_admin())
  )
);
