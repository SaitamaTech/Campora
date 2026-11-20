-- Return only the authenticated caller's following list. Hidden or inactive
-- targets are omitted entirely, and only public student-facing fields are exposed.
create or replace function public.get_my_following_profiles(p_limit integer default 100)
returns table (
  id uuid,
  full_name text,
  username text,
  faculty text,
  department text,
  academic_level smallint,
  academic_level_label text
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
         p.academic_level_label
    from public.profile_follows pf
    join public.profiles p on p.id = pf.followed_id
    left join public.faculties f on f.id = p.faculty_id and f.is_active
    left join public.departments d on d.id = p.department_id and d.faculty_id = f.id and d.is_active
   where pf.follower_id = auth.uid()
     and p.is_active
     and p.is_public
     and exists (
       select 1
         from public.profiles owner_profile
        where owner_profile.id = auth.uid()
          and owner_profile.is_active
     )
   order by pf.created_at desc, p.id
   limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;
revoke all on function public.get_my_following_profiles(integer) from public, anon;
grant execute on function public.get_my_following_profiles(integer) to authenticated;
