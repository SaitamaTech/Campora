-- A profile may reference only its owner's avatar object (user-id/file-name).
-- This complements the existing private avatar bucket and per-user storage policies.
alter table public.profiles
  add constraint profiles_avatar_path_owner_check
  check (
    avatar_path is null
    or (
      split_part(avatar_path, '/', 1) = id::text
      and split_part(avatar_path, '/', 2) <> ''
      and split_part(avatar_path, '/', 3) = ''
    )
  );
