-- Private follow relationships. Client access is intentionally RPC-only: the
-- public API can read aggregate counts, but cannot enumerate follower identities.
create table public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint profile_follows_no_self check (follower_id <> followed_id)
);

create index profile_follows_followed_idx
  on public.profile_follows (followed_id, created_at desc);

alter table public.profile_follows enable row level security;
revoke all on table public.profile_follows from public, anon, authenticated;

-- Defense-in-depth if table privileges are ever granted in a future migration.
create policy profile_follows_owner_insert
  on public.profile_follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and follower_id <> followed_id
    and exists (
      select 1 from public.profiles p
       where p.id = followed_id and p.is_active and p.is_public
    )
  );
create policy profile_follows_owner_delete
  on public.profile_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- Only the target's aggregate total and the caller's own relationship status
-- are returned. Private profiles are visible only to their own account.
create or replace function public.get_profile_follow_stats(p_profile_id uuid)
returns table (followers_count bigint, is_following boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    (select count(*)::bigint
       from public.profile_follows f
      where f.followed_id = p.id),
    exists (
      select 1
        from public.profile_follows f
       where f.follower_id = auth.uid()
         and f.followed_id = p.id
    )
    from public.profiles p
   where p.id = p_profile_id
     and p.is_active
     and (p.is_public or p.id = auth.uid());
$$;
revoke all on function public.get_profile_follow_stats(uuid) from public;
grant execute on function public.get_profile_follow_stats(uuid) to anon, authenticated;

-- Following a student is an atomic server-side operation. The authenticated
-- identity comes from auth.uid(), never from a client-supplied follower ID.
create or replace function public.set_profile_follow(p_followed_id uuid, p_follow boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Sign in to follow students.';
  end if;
  if p_followed_id is null or p_follow is null then
    raise exception 'Choose a valid profile and follow action.';
  end if;
  if caller_id = p_followed_id then
    raise exception 'You cannot follow your own profile.';
  end if;

  if p_follow then
    if not exists (
      select 1 from public.profiles p
       where p.id = p_followed_id and p.is_active and p.is_public
    ) then
      raise exception 'This public profile is not available to follow.';
    end if;
    insert into public.profile_follows (follower_id, followed_id)
    values (caller_id, p_followed_id)
    on conflict (follower_id, followed_id) do nothing;
  else
    delete from public.profile_follows
     where follower_id = caller_id
       and followed_id = p_followed_id;
  end if;
end;
$$;
revoke all on function public.set_profile_follow(uuid, boolean) from public, anon;
grant execute on function public.set_profile_follow(uuid, boolean) to authenticated;
