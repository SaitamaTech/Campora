-- CAMPORA RLS hardening: keep account-control and moderation fields administrator-controlled.
-- Apply after 202611200001_initial_schema.sql.

create or replace function public.prevent_self_role_promotion()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only an administrator may change account roles';
  end if;
  if old.verified_representative is distinct from new.verified_representative and not public.is_admin() then
    raise exception 'Only an administrator may change representative verification';
  end if;
  if old.is_active is distinct from new.is_active and not public.is_admin() then
    raise exception 'Only an administrator may change account active state';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_unprivileged_moderation_status_change()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if old.status is distinct from new.status and not public.is_moderator_or_admin() then
    raise exception 'Only moderators or administrators may change moderation status';
  end if;
  return new;
end;
$$;

create trigger lost_found_protect_status
before update on public.lost_found_items
for each row execute function public.prevent_unprivileged_moderation_status_change();

create trigger community_posts_protect_status
before update on public.community_posts
for each row execute function public.prevent_unprivileged_moderation_status_change();

create trigger post_comments_protect_status
before update on public.post_comments
for each row execute function public.prevent_unprivileged_moderation_status_change();

create or replace function public.prevent_non_admin_official_resource_flag()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_official and not public.is_admin() then
      raise exception 'Only an administrator may mark an academic resource official';
    end if;
  elsif old.is_official is distinct from new.is_official and not public.is_admin() then
    raise exception 'Only an administrator may change the official resource flag';
  end if;
  return new;
end;
$$;

create trigger academic_resources_protect_official_flag
before insert or update on public.academic_resources
for each row execute function public.prevent_non_admin_official_resource_flag();

drop policy if exists academic_resources_owner_update on public.academic_resources;
create policy academic_resources_owner_update on public.academic_resources
for update to authenticated
using (contributor_id = (select auth.uid()))
with check (
  contributor_id = (select auth.uid())
  and status in ('pending','rejected')
  and not is_official
);
