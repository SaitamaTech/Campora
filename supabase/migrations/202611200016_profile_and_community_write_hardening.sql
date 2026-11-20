-- Protect profile data with least-privilege grants and preserve the supported postgraduate label.

alter table public.profiles
  add column if not exists academic_level_label text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_academic_level_label_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_academic_level_label_check
      check (
        academic_level_label is null
        or (academic_level_label = 'Postgraduate' and academic_level is null)
      );
  end if;
end;
$$;

-- The public directory exposes only student-facing fields through this bounded RPC;
-- it never returns email, account role, or active-state metadata.
drop function if exists public.get_public_student_profiles(uuid, text, integer);
create function public.get_public_student_profiles(
  p_profile_id uuid default null,
  p_search text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  full_name text,
  username text,
  faculty text,
  department text,
  academic_level smallint,
  academic_level_label text,
  bio text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id,
         p.full_name,
         p.username::text,
         f.name,
         d.name,
         p.academic_level,
         p.academic_level_label,
         p.bio,
         case when p_profile_id is not null then p.avatar_path else null end
    from public.profiles p
    left join public.faculties f on f.id = p.faculty_id and f.is_active
    left join public.departments d on d.id = p.department_id and d.is_active
   where p.is_active
     and (p.is_public or p.id = auth.uid())
     and (p_profile_id is null or p.id = p_profile_id)
     and (
       nullif(btrim(p_search), '') is null
       or p.full_name ilike '%' || btrim(p_search) || '%'
       or p.username::text ilike '%' || btrim(p_search) || '%'
       or f.name ilike '%' || btrim(p_search) || '%'
       or d.name ilike '%' || btrim(p_search) || '%'
     )
   order by lower(p.full_name), p.id
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke all on function public.get_public_student_profiles(uuid, text, integer) from public;
grant execute on function public.get_public_student_profiles(uuid, text, integer) to anon, authenticated;

-- Public directory access is limited to the bounded RPC; direct table reads are
-- reserved for the owner's row and administrators, protecting private profile fields.
drop policy if exists profiles_public_read on public.profiles;

-- Authenticated users can read their own profile and admins can manage profile records,
-- but only ordinary profile fields are writable by clients. Privileged fields remain
-- additionally protected by RLS and database triggers.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (
  full_name,
  username,
  faculty_id,
  department_id,
  academic_level,
  academic_level_label,
  avatar_path,
  bio,
  is_public,
  role,
  is_active,
  verified_representative
) on table public.profiles to authenticated;

-- Content remains publicly readable only through the approved-row policies; writes
-- require an authenticated owner and are still checked by RLS and moderation triggers.
revoke all on table public.community_posts from public, anon, authenticated;
grant select on table public.community_posts to anon, authenticated;
grant insert, update, delete on table public.community_posts to authenticated;

revoke all on table public.post_comments from public, anon, authenticated;
grant select on table public.post_comments to anon, authenticated;
grant insert, update, delete on table public.post_comments to authenticated;

revoke all on table public.post_reactions from public, anon, authenticated;
grant select, insert, delete on table public.post_reactions to authenticated;

-- These SECURITY DEFINER functions are invoked only by PostgreSQL triggers, not by
-- client RPC calls. Revoking EXECUTE does not disable their already-installed triggers.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_self_role_promotion() from public, anon, authenticated;
revoke all on function public.prevent_unprivileged_moderation_status_change() from public, anon, authenticated;
revoke all on function public.prevent_non_admin_official_resource_flag() from public, anon, authenticated;
revoke all on function public.prevent_marketplace_status_change() from public, anon, authenticated;
revoke all on function public.protect_contact_request_fields() from public, anon, authenticated;
revoke all on function public.marketplace_category_type_guard() from public, anon, authenticated;
revoke all on function public.marketplace_listing_guard() from public, anon, authenticated;
revoke all on function public.marketplace_image_guard() from public, anon, authenticated;
revoke all on function public.marketplace_contact_guard() from public, anon, authenticated;
revoke all on function public.marketplace_report_guard() from public, anon, authenticated;
