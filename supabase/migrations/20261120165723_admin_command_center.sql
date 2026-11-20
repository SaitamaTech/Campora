-- CAMPORA Admin Command Center: additive settings, server-side metrics, audit trail, and private campus images.

create table if not exists public.platform_settings (
  key text primary key check (key in ('platform_name','support_email','organization','founder','github','maintenance_mode','registration_enabled','content_moderation_enabled')),
  value jsonb not null check (
    (key in ('platform_name','support_email','organization','founder','github') and jsonb_typeof(value) = 'string')
    or (key in ('maintenance_mode','registration_enabled','content_moderation_enabled') and jsonb_typeof(value) = 'boolean')
  ),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value) values
  ('platform_name', to_jsonb('CAMPORA'::text)),
  ('support_email', to_jsonb('israellawal323@gmail.com'::text)),
  ('organization', to_jsonb('Saitama Tech'::text)),
  ('founder', to_jsonb('Lawal Israel'::text)),
  ('github', to_jsonb('https://github.com/SaitamaTech'::text)),
  ('maintenance_mode', 'false'::jsonb),
  ('registration_enabled', 'true'::jsonb),
  ('content_moderation_enabled', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_admin_manage on public.platform_settings;
create policy platform_settings_admin_manage on public.platform_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.platform_settings to authenticated;
revoke delete on public.platform_settings from authenticated;

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (length(btrim(action)) between 2 and 100),
  entity_type text not null check (length(btrim(entity_type)) between 2 and 80),
  entity_id uuid,
  summary text not null check (length(btrim(summary)) between 2 and 500),
  created_at timestamptz not null default now()
);
create index if not exists admin_activity_logs_created_idx on public.admin_activity_logs(created_at desc);
create index if not exists admin_activity_logs_actor_idx on public.admin_activity_logs(actor_id, created_at desc);
alter table public.admin_activity_logs enable row level security;
drop policy if exists admin_activity_logs_admin_read on public.admin_activity_logs;
create policy admin_activity_logs_admin_read on public.admin_activity_logs
  for select to authenticated using (public.is_admin());
grant select on public.admin_activity_logs to authenticated;

create or replace function public.record_admin_login()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_moderator_or_admin() then
    return false;
  end if;
  insert into public.admin_activity_logs (actor_id, action, entity_type, entity_id, summary)
  values (v_actor, 'login', 'administrator', v_actor, 'Administrator signed in to CAMPORA.');
  return true;
end;
$$;
revoke all on function public.record_admin_login() from public, anon;
grant execute on function public.record_admin_login() to authenticated;

create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := (select auth.uid());
  v_before jsonb;
  v_after jsonb;
  v_entity_id uuid;
  v_action text := lower(tg_op);
  v_summary text;
begin
  if v_actor is null or not public.is_moderator_or_admin() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then v_before := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_after := to_jsonb(new); end if;
  v_entity_id := coalesce(v_after ->> 'id', v_before ->> 'id')::uuid;

  if tg_table_name = 'profiles' then
    if tg_op <> 'UPDATE' or (v_before ->> 'role' is not distinct from v_after ->> 'role'
       and v_before ->> 'is_active' is not distinct from v_after ->> 'is_active'
       and v_before ->> 'verified_representative' is not distinct from v_after ->> 'verified_representative') then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    if v_before ->> 'role' is distinct from v_after ->> 'role' then
      v_action := 'role_change'; v_summary := 'Administrator changed an account role.';
    else
      v_action := 'account_access'; v_summary := 'Administrator changed account access or verification.';
    end if;
  elsif tg_table_name = 'support_replies' then
    v_action := 'support_reply'; v_summary := 'A support response was sent.';
  elsif tg_table_name = 'support_tickets' then
    v_action := 'support_ticket'; v_summary := 'A support request was updated.';
  elsif tg_table_name = 'user_reports' or tg_table_name = 'marketplace_reports' then
    v_action := 'report_review'; v_summary := 'A user report was reviewed.';
  elsif tg_table_name = 'platform_settings' then
    v_action := 'settings_change'; v_summary := 'A platform setting was changed.';
  elsif tg_table_name = 'announcements' then
    v_action := case when v_action = 'insert' then 'announcement_publish' else 'announcement_update' end;
    v_summary := case when coalesce(v_after ->> 'status', '') = 'approved' then 'An announcement was published or updated.' else 'An announcement was changed.' end;
  elsif tg_table_name = 'campus_locations' then
    v_action := 'location_change'; v_summary := 'A campus location was added, changed, or removed.';
  elsif tg_table_name = 'marketplace_listings' then
    v_action := 'listing_review'; v_summary := 'A marketplace listing was moderated.';
  else
    v_action := tg_table_name || '_' || lower(tg_op);
    v_summary := 'A moderation or content-management action was recorded.';
  end if;

  insert into public.admin_activity_logs (actor_id, action, entity_type, entity_id, summary)
  values (v_actor, v_action, tg_table_name, v_entity_id, coalesce(v_summary, 'An administrator action was recorded.'));
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.audit_admin_change() from public, anon, authenticated;

drop trigger if exists profiles_admin_audit on public.profiles;
create trigger profiles_admin_audit after update on public.profiles for each row execute function public.audit_admin_change();
drop trigger if exists academic_resources_admin_audit on public.academic_resources;
create trigger academic_resources_admin_audit after insert or update or delete on public.academic_resources for each row execute function public.audit_admin_change();
drop trigger if exists announcements_admin_audit on public.announcements;
create trigger announcements_admin_audit after insert or update or delete on public.announcements for each row execute function public.audit_admin_change();
drop trigger if exists campus_locations_admin_audit on public.campus_locations;
create trigger campus_locations_admin_audit after insert or update or delete on public.campus_locations for each row execute function public.audit_admin_change();
drop trigger if exists opportunities_admin_audit on public.opportunities;
create trigger opportunities_admin_audit after insert or update or delete on public.opportunities for each row execute function public.audit_admin_change();
drop trigger if exists marketplace_listings_admin_audit on public.marketplace_listings;
create trigger marketplace_listings_admin_audit after insert or update or delete on public.marketplace_listings for each row execute function public.audit_admin_change();
drop trigger if exists community_posts_admin_audit on public.community_posts;
create trigger community_posts_admin_audit after insert or update or delete on public.community_posts for each row execute function public.audit_admin_change();
drop trigger if exists post_comments_admin_audit on public.post_comments;
create trigger post_comments_admin_audit after insert or update or delete on public.post_comments for each row execute function public.audit_admin_change();
drop trigger if exists user_reports_admin_audit on public.user_reports;
create trigger user_reports_admin_audit after update on public.user_reports for each row execute function public.audit_admin_change();
drop trigger if exists marketplace_reports_admin_audit on public.marketplace_reports;
create trigger marketplace_reports_admin_audit after update on public.marketplace_reports for each row execute function public.audit_admin_change();
drop trigger if exists support_tickets_admin_audit on public.support_tickets;
create trigger support_tickets_admin_audit after update on public.support_tickets for each row execute function public.audit_admin_change();
drop trigger if exists support_replies_admin_audit on public.support_replies;
create trigger support_replies_admin_audit after insert on public.support_replies for each row execute function public.audit_admin_change();
drop trigger if exists platform_settings_admin_audit on public.platform_settings;
create trigger platform_settings_admin_audit after insert or update or delete on public.platform_settings for each row execute function public.audit_admin_change();

create or replace function public.get_admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  with day_series as (
    select generate_series(current_date - 29, current_date, interval '1 day')::date as day
  ),
  registrations as (
    select created_at::date as day, count(*)::integer as total
    from public.profiles
    where created_at >= current_date - 29
    group by created_at::date
  ),
  activity_rows as (
    select created_at::date as day from public.profiles where created_at >= current_date - 29
    union all select created_at::date from public.academic_resources where created_at >= current_date - 29
    union all select created_at::date from public.announcements where created_at >= current_date - 29
    union all select created_at::date from public.campus_locations where created_at >= current_date - 29
    union all select created_at::date from public.opportunities where created_at >= current_date - 29
    union all select created_at::date from public.lost_found_items where created_at >= current_date - 29
    union all select created_at::date from public.marketplace_listings where created_at >= current_date - 29
    union all select created_at::date from public.community_posts where created_at >= current_date - 29
    union all select created_at::date from public.post_comments where created_at >= current_date - 29
    union all select created_at::date from public.support_tickets where created_at >= current_date - 29
    union all select created_at::date from public.support_replies where created_at >= current_date - 29
    union all select created_at::date from public.user_reports where created_at >= current_date - 29
    union all select created_at::date from public.marketplace_reports where created_at >= current_date - 29
    union all select created_at::date from public.contact_requests where created_at >= current_date - 29
  ),
  activity as (
    select day, count(*)::integer as total from activity_rows group by day
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'registered_students', (select count(*) from public.profiles where role in ('student','contributor')),
      'active_users', (select count(*) from public.profiles where is_active),
      'total_marketplace_listings', (select count(*) from public.marketplace_listings),
      'pending_advertisements', (select count(*) from public.marketplace_listings where status = 'pending'),
      'academic_resources', (select count(*) from public.academic_resources),
      'campus_locations', (select count(*) from public.campus_locations),
      'pending_location_verifications', (select count(*) from public.campus_locations where status = 'pending'),
      'open_support_tickets', (select count(*) from public.support_tickets where status in ('open','in_progress','awaiting_response')),
      'unresolved_reports',
        (select count(*) from public.user_reports where status in ('open','reviewing'))
        + (select count(*) from public.marketplace_reports where status in ('open','reviewing'))
    ),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'count', coalesce(r.total, 0)) order by d.day)
      from day_series d left join registrations r on r.day = d.day
    ), '[]'::jsonb),
    'platform_activity', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'count', coalesce(a.total, 0)) order by d.day)
      from day_series d left join activity a on a.day = d.day
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_admin_dashboard_metrics() from public, anon;
grant execute on function public.get_admin_dashboard_metrics() to authenticated;

create or replace function public.get_public_platform_controls()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'maintenance_mode', coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'maintenance_mode'), false),
    'registration_enabled', coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'registration_enabled'), true),
    'content_moderation_enabled', coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'content_moderation_enabled'), true)
  );
$$;
revoke all on function public.get_public_platform_controls() from public;
grant execute on function public.get_public_platform_controls() to anon, authenticated;

-- Runtime controls are enforced in PostgreSQL, so direct REST calls cannot
-- bypass the settings page or its client-side affordances.
create or replace function public.enforce_campora_write_controls()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_controls jsonb := public.get_public_platform_controls();
begin
  if public.is_moderator_or_admin() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if coalesce((v_controls ->> 'maintenance_mode')::boolean, false) then
    raise exception 'CAMPORA is in maintenance mode. Please try again later.' using errcode = '55000';
  end if;
  if tg_op = 'INSERT'
     and tg_table_name in ('academic_resources','opportunities','lost_found_items','marketplace_listings','community_posts','post_comments')
     and not coalesce((v_controls ->> 'content_moderation_enabled')::boolean, true) then
    raise exception 'Student content submissions are temporarily paused.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.enforce_campora_write_controls() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles','academic_resources','announcements','campus_locations','opportunities',
    'lost_found_items','marketplace_listings','community_posts','post_comments',
    'support_tickets','support_replies','feedback','user_reports','marketplace_reports',
    'contact_requests','post_reactions','profile_follows','notifications'
  ] loop
    execute format('drop trigger if exists campora_platform_write_guard on public.%I', v_table);
    execute format(
      'create trigger campora_platform_write_guard before insert or update or delete on public.%I for each row execute function public.enforce_campora_write_controls()',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.enforce_campora_registration_control()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not coalesce((public.get_public_platform_controls() ->> 'registration_enabled')::boolean, true) then
    raise exception 'New CAMPORA registrations are temporarily disabled.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_campora_registration_control() from public, anon, authenticated;
drop trigger if exists campora_registration_control on auth.users;
create trigger campora_registration_control before insert on auth.users
  for each row execute function public.enforce_campora_registration_control();

alter table public.campus_locations
  add column if not exists image_path text
  check (
    image_path is null
    or (
      length(image_path) between 1 and 1024
      and created_by is not null
      and (storage.foldername(image_path))[1] = created_by::text
      and image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-location-images', 'campus-location-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists campora_upload_campus_location_images on storage.objects;
create policy campora_upload_campus_location_images on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campus-location-images' and public.is_admin() and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists campora_read_campus_location_images on storage.objects;
create policy campora_read_campus_location_images on storage.objects
  for select to public
  using (
    bucket_id = 'campus-location-images'
    and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
    and exists (
      select 1 from public.campus_locations l
      where l.image_path = storage.objects.name
        and ((l.status = 'approved' and l.is_active) or public.is_admin())
    )
  );
drop policy if exists campora_delete_campus_location_images on storage.objects;
create policy campora_delete_campus_location_images on storage.objects
  for delete to authenticated
  using (bucket_id = 'campus-location-images' and public.is_admin());
