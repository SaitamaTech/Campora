-- Tighten the owner guard: an avatar path is exactly <user-id>/<filename>.
alter table public.profiles
  drop constraint if exists profiles_avatar_path_owner_check;

alter table public.profiles
  add constraint profiles_avatar_path_owner_check
  check (
    avatar_path is null
    or (
      split_part(avatar_path, '/', 1) = id::text
      and split_part(avatar_path, '/', 2) <> ''
      and length(avatar_path) - length(replace(avatar_path, '/', '')) = 1
    )
  );
