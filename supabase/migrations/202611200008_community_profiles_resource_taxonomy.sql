-- CAMPORA social feed, safe student directory, and academic-resource taxonomy.
-- Community posts/replies intentionally have no image or attachment columns.
-- Profile-photo and academic-resource buckets remain separate and private.

alter table public.community_posts
  add column if not exists feeling text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_posts_feeling_check'
      and conrelid = 'public.community_posts'::regclass
  ) then
    alter table public.community_posts
      add constraint community_posts_feeling_check
      check (feeling is null or feeling in (
        'Happy', 'Grateful', 'Excited', 'Motivated', 'Curious', 'Hopeful',
        'Tired', 'Stressed', 'Anxious', 'Sad', 'Frustrated'
      ));
  end if;
end;
$$;

alter table public.academic_resources
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists academic_resources_directory_idx
  on public.academic_resources (academic_level, faculty_id, department_id, status, created_at desc);

-- Relate old text labels only when they exactly match an existing official faculty/department pair.
-- No faculty or department data is created or renamed here.
update public.academic_resources r
set department_id = d.id,
    faculty_id = coalesce(r.faculty_id, f.id)
from public.departments d
join public.faculties f on f.id = d.faculty_id and f.is_active
where d.is_active
  and r.department_id is null
  and lower(btrim(r.department)) = lower(btrim(d.name))
  and (r.faculty_id is null or r.faculty_id = f.id)
  and (r.faculty is null or lower(btrim(r.faculty)) = lower(btrim(f.name)));

create or replace function public.guard_academic_resource_directory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  department_name text;
  faculty_name text;
begin
  if tg_op = 'INSERT'
     or new.faculty_id is distinct from old.faculty_id
     or new.department_id is distinct from old.department_id
     or new.academic_level is distinct from old.academic_level
     or new.faculty is distinct from old.faculty
     or new.department is distinct from old.department
     or (new.status = 'approved' and old.status is distinct from new.status) then
    if new.academic_level is null or new.academic_level not between 1 and 4 then
      raise exception 'Academic resources must be assigned to 100, 200, 300, or 400 level';
    end if;
    if new.faculty_id is null or new.department_id is null then
      raise exception 'Choose a faculty and department from the campus directory';
    end if;
    select d.name, f.name
      into department_name, faculty_name
      from public.departments d
      join public.faculties f on f.id = d.faculty_id
     where d.id = new.department_id
       and d.faculty_id = new.faculty_id
       and d.is_active
       and f.is_active;
    if not found then
      raise exception 'Choose an active department listed under the selected faculty';
    end if;
    -- Store the official labels from the referenced directory records, not client-supplied text.
    new.faculty := faculty_name;
    new.department := department_name;
  end if;
  return new;
end;
$$;

drop trigger if exists academic_resources_guard_directory on public.academic_resources;
create trigger academic_resources_guard_directory
before insert or update on public.academic_resources
for each row execute function public.guard_academic_resource_directory();

-- Do not expose the whole profiles row through the old table-level public-read policy.
-- Signed-in users may still read their own account row (and administrators may manage users).
drop policy if exists profiles_public_read on public.profiles;
revoke select on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

-- The avatar bucket stays private. This helper exposes no profile fields and only
-- answers whether a particular stored avatar path may be fetched.
create or replace function public.can_view_campora_avatar(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.profiles p
     where p.avatar_path = object_path
       and ((p.is_active and p.is_public) or p.id = auth.uid() or public.is_admin())
  );
$$;
revoke all on function public.can_view_campora_avatar(text) from public;
grant execute on function public.can_view_campora_avatar(text) to anon, authenticated;

drop policy if exists campora_fetch_visible_avatars on storage.objects;
create policy campora_fetch_visible_avatars
on storage.objects
for select to public
using (
  bucket_id = 'avatars'
  and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
  and public.can_view_campora_avatar(storage.objects.name)
);

-- Deliberately return only student-facing profile details. In particular, this omits
-- email (which is held by auth.users), account roles, active-state flags, and admin metadata.
create or replace function public.get_public_student_profiles(
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

-- Existing approved rows that cannot be matched to the official 100–400 taxonomy
-- remain stored, but are hidden from the public library until a moderator fixes them.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'academic_resources_approved_taxonomy_check'
      and conrelid = 'public.academic_resources'::regclass
  ) then
    alter table public.academic_resources
      add constraint academic_resources_approved_taxonomy_check
      check (
        status <> 'approved'
        or (
          academic_level is not null
          and academic_level between 1 and 4
          and faculty_id is not null
          and department_id is not null
        )
      ) not valid;
  end if;
end;
$$;

drop policy if exists academic_resources_public_read on public.academic_resources;
create policy academic_resources_public_read
on public.academic_resources
for select to anon, authenticated
using (
  status = 'approved'
  and academic_level between 1 and 4
  and faculty_id is not null
  and department_id is not null
  and exists (
    select 1
    from public.departments d
    join public.faculties f on f.id = d.faculty_id and f.is_active
    where d.id = academic_resources.department_id
      and d.faculty_id = academic_resources.faculty_id
      and d.is_active
  )
);

-- The client does not choose the department shown on a post. It is always
-- derived from that active student's official profile record on the server.
create or replace function public.guard_community_post_author_context()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile_is_active boolean;
  profile_faculty_id uuid;
  profile_department_id uuid;
begin
  if new.author_id is null then
    raise exception 'A community post must have an author';
  end if;
  if auth.uid() is not null
     and new.author_id is distinct from auth.uid()
     and not public.is_moderator_or_admin() then
    raise exception 'You can only create or update your own community post';
  end if;
  select p.is_active, f.id, d.id
    into profile_is_active, profile_faculty_id, profile_department_id
    from public.profiles p
    left join public.faculties f on f.id = p.faculty_id and f.is_active
    left join public.departments d on d.id = p.department_id and d.faculty_id = f.id and d.is_active
   where p.id = new.author_id;
  if not found then
    raise exception 'A student profile is required to post';
  end if;
  if not profile_is_active then
    if tg_op = 'INSERT'
       or (auth.uid() is not null and auth.uid() = new.author_id and not public.is_moderator_or_admin()) then
      raise exception 'An active student profile is required to post';
    end if;
    -- Moderators can still review older posts from a deactivated account.
    new.faculty_id := null;
    new.department_id := null;
    return new;
  end if;
  -- A missing or inactive department is intentionally NULL (and will not enter
  -- a department feed); never retain a client-supplied or mismatched directory ID.
  new.faculty_id := profile_faculty_id;
  new.department_id := profile_department_id;
  return new;
end;
$$;
revoke all on function public.guard_community_post_author_context() from public;
grant execute on function public.guard_community_post_author_context() to authenticated;

drop trigger if exists community_posts_guard_author_context on public.community_posts;
create trigger community_posts_guard_author_context
before insert or update on public.community_posts
for each row execute function public.guard_community_post_author_context();
