-- CAMPORA notification events: welcome, app-update broadcasts, and recipient-owned read state.

-- App updates are published through the existing administrator noticeboard.
alter type public.announcement_category add value if not exists 'app_update';

create or replace function public.create_profile_welcome_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.notifications (recipient_id, notification_type, title, body, resource_type)
  values (
    new.id,
    'welcome',
    'Welcome to CAMPORA',
    'Your campus, your community, your world. Explore study resources, campus updates and opportunities.',
    'welcome'
  );
  return new;
end;
$$;

revoke all on function public.create_profile_welcome_notification() from public, anon, authenticated;

drop trigger if exists profiles_create_welcome_notification on public.profiles;
create trigger profiles_create_welcome_notification
  after insert on public.profiles
  for each row execute function public.create_profile_welcome_notification();

create or replace function public.broadcast_campora_app_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.category::text <> 'app_update'
    or new.status <> 'approved'
    or new.published_at is null then
    return new;
  end if;

  -- An update is broadcast only once on first publication, not on edits.
  if tg_op = 'UPDATE' then
    if old.category::text = 'app_update'
      and old.status = 'approved'
      and old.published_at is not null then
      return new;
    end if;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, resource_type, resource_id
  )
  select
    profiles.id,
    new.author_id,
    'app_update',
    new.title,
    left(new.body, 5000),
    'announcement',
    new.id
  from public.profiles as profiles
  where profiles.is_active;

  return new;
end;
$$;

revoke all on function public.broadcast_campora_app_update() from public, anon, authenticated;

drop trigger if exists announcements_broadcast_campora_app_update on public.announcements;
create trigger announcements_broadcast_campora_app_update
  after insert or update of category, status, published_at on public.announcements
  for each row execute function public.broadcast_campora_app_update();

-- Do not let a recipient rewrite a notification row or mark it unread again.
drop policy if exists notifications_recipient_read_update on public.notifications;
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_read on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));
revoke update on table public.notifications from public, anon, authenticated;

create or replace function public.mark_campora_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_exists boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in is required to mark a notification as read.' using errcode = '28000';
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_id = v_user_id
    and not is_read;

  if found then
    return true;
  end if;

  select exists (
    select 1 from public.notifications
    where id = p_notification_id and recipient_id = v_user_id and is_read
  ) into v_exists;
  return coalesce(v_exists, false);
end;
$$;

revoke all on function public.mark_campora_notification_read(uuid) from public, anon;
grant execute on function public.mark_campora_notification_read(uuid) to authenticated;
