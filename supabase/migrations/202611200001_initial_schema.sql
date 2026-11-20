-- CAMPORA initial schema
-- No official campus records or fabricated user data are seeded here.
-- Operator setup:
--   1. Apply this migration with Supabase migrations.
--   2. Promote the first administrator only from a trusted server-side/admin SQL
--      session by updating profiles.role; never expose a service-role key client-side.
--   3. The storage buckets below are created empty. Upload paths should begin with
--      the authenticated user's UUID (for example: <user-id>/resource.pdf).
--   4. Storage object policies are intentionally conservative; review retention,
--      antivirus scanning, and CDN/cache settings before production launch.

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.user_role as enum ('student', 'contributor', 'moderator', 'administrator');
create type public.content_status as enum ('draft', 'pending', 'approved', 'rejected', 'archived');
create type public.announcement_category as enum ('general', 'faculty', 'department', 'student_association', 'event', 'deadline');
create type public.opportunity_category as enum ('scholarship', 'internship', 'graduate_programme', 'competition', 'hackathon', 'online_course', 'conference', 'fellowship', 'volunteer', 'entrepreneurship', 'other');
create type public.lost_found_type as enum ('lost', 'found');
create type public.listing_category as enum ('textbooks', 'electronics', 'fashion', 'accommodation', 'student_services', 'other');
create type public.ticket_status as enum ('open', 'in_progress', 'awaiting_response', 'resolved', 'closed');
create type public.ticket_category as enum ('account_problems', 'login_issues', 'academic_resources', 'marketplace_problems', 'report_abuse', 'technical_problems', 'suggestions', 'other');
create type public.feedback_type as enum ('feature_request', 'complaint', 'general_feedback', 'improvement_suggestion');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.location_type as enum ('lecture_hall', 'administrative_office', 'laboratory', 'library', 'student_facility', 'essential_service', 'other');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 160),
  code text check (code is null or (length(btrim(code)) between 2 and 30 and code = upper(code))),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name), unique (code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculties(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  code text check (code is null or (length(btrim(code)) between 2 and 30 and code = upper(code))),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (faculty_id, name), unique (faculty_id, code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  username citext unique check (username is null or username::text ~ '^[a-zA-Z0-9_]{3,30}$'),
  faculty_id uuid references public.faculties(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  academic_level smallint check (academic_level is null or academic_level between 1 and 12),
  avatar_path text,
  bio text check (bio is null or length(bio) <= 1000),
  role public.user_role not null default 'student',
  is_active boolean not null default true,
  is_public boolean not null default true,
  verified_representative boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (avatar_path is null or (length(avatar_path) between 1 and 1024 and avatar_path not like '%..%'))
);

-- Correct the username check to avoid relying on a word-like numeric regex token.
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check check (username is null or username::text ~ '^[a-zA-Z0-9_]{3,30}$');

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  code text not null check (length(btrim(code)) between 2 and 30 and code = upper(code)),
  title text not null check (length(btrim(title)) between 2 and 200),
  description text,
  level smallint check (level is null or level between 1 and 12),
  credit_units numeric(4,1) check (credit_units is null or credit_units between 0 and 99),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, code)
);

create table public.academic_resources (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid references public.courses(id) on delete set null,
  course_code text not null default '' check (length(course_code) <= 40),
  faculty_id uuid references public.faculties(id) on delete set null,
  faculty text,
  department text,
  academic_level smallint check (academic_level is null or academic_level between 1 and 12),
  title text not null check (length(btrim(title)) between 2 and 240),
  description text,
  file_name text not null default 'No file attached' check (length(file_name) <= 255),
  resource_type text not null check (resource_type in ('pdf','doc','docx','ppt','pptx','image','other')),
  storage_path text not null check (length(storage_path) between 1 and 1024 and storage_path not like '%..%'),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 1 and 52428800),
  mime_type text check (mime_type is null or length(mime_type) <= 120),
  status public.content_status not null default 'pending',
  is_official boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  faculty_id uuid references public.faculties(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  title text not null check (length(btrim(title)) between 2 and 240),
  body text not null check (length(btrim(body)) between 2 and 20000),
  category public.announcement_category not null default 'general',
  status public.content_status not null default 'draft',
  is_official boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or published_at is null or expires_at > published_at),
  check (not is_official or status = 'approved')
);

create table public.campus_locations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  name text not null check (length(btrim(name)) between 2 and 200),
  location_type public.location_type not null default 'other',
  description text,
  address text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  osm_url text,
  status public.content_status not null default 'pending',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 240),
  description text not null check (length(btrim(description)) between 2 and 20000),
  eligibility text,
  deadline timestamptz,
  application_url text check (application_url is null or length(application_url) <= 2048),
  category public.opportunity_category not null,
  source text check (source is null or length(btrim(source)) <= 240),
  status public.content_status not null default 'pending',
  is_verified boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lost_found_items (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  item_type public.lost_found_type not null,
  title text not null check (length(btrim(title)) between 2 and 200),
  description text not null check (length(btrim(description)) between 2 and 10000),
  location_description text check (location_description is null or length(location_description) <= 1000),
  occurred_on date,
  contact_method text check (contact_method is null or length(contact_method) <= 1000),
  image_path text check (image_path is null or (length(image_path) <= 1024 and image_path not like '%..%')),
  status public.content_status not null default 'approved',
  is_recovered boolean not null default false,
  recovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 240),
  description text not null check (length(btrim(description)) between 2 and 10000),
  category public.listing_category not null,
  price numeric(12,2) check (price is null or price >= 0),
  currency_code char(3) not null default 'NGN' check (currency_code = upper(currency_code)),
  contact_method text check (contact_method is null or length(contact_method) <= 1000),
  image_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(image_paths) = 'array'),
  status public.content_status not null default 'pending',
  is_sold boolean not null default false,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  faculty_id uuid references public.faculties(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  title text check (title is null or length(btrim(title)) between 2 and 240),
  body text not null check (length(btrim(body)) between 1 and 20000),
  status public.content_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 10000),
  status public.content_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('marketplace_listing', 'lost_found_item')),
  target_id uuid not null,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  private_message text not null check (length(btrim(private_message)) between 1 and 5000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  reported_user_id uuid references public.profiles(id) on delete set null,
  resource_type text not null check (resource_type in ('academic_resource','announcement','campus_location','opportunity','lost_found_item','marketplace_listing','community_post','post_comment','profile')),
  resource_id uuid not null,
  reason text not null check (length(btrim(reason)) between 2 and 1000),
  status public.report_status not null default 'open',
  reviewed_by uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_reference text not null unique default ('CAM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  category public.ticket_category not null,
  subject text not null check (length(btrim(subject)) between 2 and 240),
  description text not null check (length(btrim(description)) between 2 and 20000),
  attachment_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(attachment_paths) = 'array'),
  status public.ticket_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 20000),
  attachment_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(attachment_paths) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  submitter_id uuid references public.profiles(id) on delete set null,
  feedback_type public.feedback_type not null,
  message text not null check (length(btrim(message)) between 2 and 20000),
  is_anonymous boolean not null default false,
  status public.content_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (length(btrim(notification_type)) between 2 and 80),
  title text not null check (length(btrim(title)) between 1 and 240),
  body text check (body is null or length(body) <= 5000),
  resource_type text,
  resource_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index departments_faculty_idx on public.departments(faculty_id);
create index courses_department_idx on public.courses(department_id);
create index profiles_faculty_department_idx on public.profiles(faculty_id, department_id);
create index academic_resources_course_status_idx on public.academic_resources(course_id, status, created_at desc);
create index academic_resources_contributor_idx on public.academic_resources(contributor_id);
create index announcements_public_idx on public.announcements(status, published_at desc, expires_at);
create index opportunities_public_idx on public.opportunities(status, deadline, created_at desc);
create index campus_locations_public_idx on public.campus_locations(status, is_active, name);
create index lost_found_public_idx on public.lost_found_items(status, is_recovered, created_at desc);
create index marketplace_public_idx on public.marketplace_listings(status, is_sold, created_at desc);
create index community_posts_public_idx on public.community_posts(status, created_at desc);
create index post_comments_post_idx on public.post_comments(post_id, status, created_at);
create index post_reactions_post_idx on public.post_reactions(post_id, created_at);
create index contact_requests_requester_idx on public.contact_requests(requester_id, created_at desc);
create index contact_requests_recipient_idx on public.contact_requests(recipient_id, created_at desc);
create index contact_requests_target_idx on public.contact_requests(target_type, target_id, created_at desc);
create index reports_status_idx on public.user_reports(status, created_at desc);
create index reports_resource_idx on public.user_reports(resource_type, resource_id);
create index support_tickets_requester_idx on public.support_tickets(requester_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets(status, updated_at desc);
create index support_replies_ticket_idx on public.support_replies(ticket_id, created_at);
create index feedback_status_idx on public.feedback(status, created_at desc);
create index notifications_recipient_idx on public.notifications(recipient_id, is_read, created_at desc);

create trigger faculties_set_updated_at before update on public.faculties for each row execute function public.set_updated_at();
create trigger departments_set_updated_at before update on public.departments for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger courses_set_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger academic_resources_set_updated_at before update on public.academic_resources for each row execute function public.set_updated_at();
create trigger announcements_set_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger campus_locations_set_updated_at before update on public.campus_locations for each row execute function public.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities for each row execute function public.set_updated_at();
create trigger lost_found_set_updated_at before update on public.lost_found_items for each row execute function public.set_updated_at();
create trigger marketplace_listings_set_updated_at before update on public.marketplace_listings for each row execute function public.set_updated_at();
create trigger community_posts_set_updated_at before update on public.community_posts for each row execute function public.set_updated_at();
create trigger post_comments_set_updated_at before update on public.post_comments for each row execute function public.set_updated_at();
create trigger contact_requests_set_updated_at before update on public.contact_requests for each row execute function public.set_updated_at();
create trigger user_reports_set_updated_at before update on public.user_reports for each row execute function public.set_updated_at();
create trigger support_tickets_set_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();
create trigger support_replies_set_updated_at before update on public.support_replies for each row execute function public.set_updated_at();
create trigger feedback_set_updated_at before update on public.feedback for each row execute function public.set_updated_at();
create trigger notifications_set_updated_at before update on public.notifications for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'administrator' and is_active); $$;
create or replace function public.is_moderator_or_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('moderator','administrator') and is_active); $$;
create or replace function public.can_contribute()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('contributor','moderator','administrator') and is_active); $$;

create or replace function public.protect_contact_request_fields()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() and (
    old.target_type is distinct from new.target_type or
    old.target_id is distinct from new.target_id or
    old.requester_id is distinct from new.requester_id or
    old.recipient_id is distinct from new.recipient_id or
    old.private_message is distinct from new.private_message
  ) then
    raise exception 'Only an administrator may change contact-request participants or target';
  end if;
  return new;
end;
$$;
create trigger contact_requests_protect_fields before update on public.contact_requests for each row execute function public.protect_contact_request_fields();

create or replace function public.prevent_marketplace_status_change()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if old.status is distinct from new.status and not public.is_moderator_or_admin() then
    raise exception 'Only moderators or administrators may change marketplace moderation status';
  end if;
  return new;
end;
$$;
create trigger marketplace_protect_status before update on public.marketplace_listings for each row execute function public.prevent_marketplace_status_change();

-- Deliberately exposes only an aggregate, not reaction rows or reacting users.
create or replace function public.post_reaction_count(p_post_id uuid)
returns bigint language sql stable security definer set search_path = public, auth
as $$
  select count(*)
  from public.post_reactions r
  join public.community_posts p on p.id = r.post_id
  where r.post_id = p_post_id and p.status = 'approved';
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  insert into public.profiles (id, full_name, avatar_path)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'CAMPORA student'), 160),
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_path'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

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
  return new;
end;
$$;
create trigger profiles_prevent_self_promotion before update on public.profiles for each row execute function public.prevent_self_role_promotion();

alter table public.profiles enable row level security;
alter table public.faculties enable row level security;
alter table public.departments enable row level security;
alter table public.courses enable row level security;
alter table public.academic_resources enable row level security;
alter table public.announcements enable row level security;
alter table public.campus_locations enable row level security;
alter table public.opportunities enable row level security;
alter table public.lost_found_items enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.community_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.contact_requests enable row level security;
alter table public.user_reports enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_replies enable row level security;
alter table public.feedback enable row level security;
alter table public.notifications enable row level security;

create policy profiles_public_read on public.profiles for select to anon, authenticated using (is_active and is_public);
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()) and role = 'student' and is_active and not verified_representative);
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy faculties_public_read on public.faculties for select to anon, authenticated using (is_active);
create policy faculties_admin_manage on public.faculties for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy departments_public_read on public.departments for select to anon, authenticated using (is_active and exists (select 1 from public.faculties f where f.id = faculty_id and f.is_active));
create policy departments_admin_manage on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy courses_public_read on public.courses for select to anon, authenticated using (is_active and exists (select 1 from public.departments d where d.id = department_id and d.is_active));
create policy courses_admin_manage on public.courses for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy academic_resources_public_read on public.academic_resources for select to anon, authenticated using (status = 'approved');
create policy academic_resources_submit on public.academic_resources for insert to authenticated with check (contributor_id = (select auth.uid()) and status = 'pending' and not is_official);
create policy academic_resources_owner_read_update on public.academic_resources for select to authenticated using (contributor_id = (select auth.uid()));
create policy academic_resources_owner_update on public.academic_resources for update to authenticated using (contributor_id = (select auth.uid())) with check (contributor_id = (select auth.uid()) and status in ('pending','rejected'));
create policy academic_resources_moderate on public.academic_resources for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

create policy announcements_public_read on public.announcements for select to anon, authenticated using (status = 'approved' and published_at is not null and (expires_at is null or expires_at > now()));
create policy announcements_author_read on public.announcements for select to authenticated using (author_id = (select auth.uid()));
create policy announcements_submit on public.announcements for insert to authenticated with check (author_id = (select auth.uid()) and not is_official and status = 'pending');
create policy announcements_author_update on public.announcements for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()) and not is_official and status in ('draft','pending','rejected'));
create policy announcements_admin_manage on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy campus_locations_public_read on public.campus_locations for select to anon, authenticated using (status = 'approved' and is_active);
create policy campus_locations_admin_manage on public.campus_locations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy opportunities_public_read on public.opportunities for select to anon, authenticated using (status = 'approved');
create policy opportunities_submit on public.opportunities for insert to authenticated with check (submitted_by = (select auth.uid()) and status = 'pending' and not is_verified);
create policy opportunities_owner_read on public.opportunities for select to authenticated using (submitted_by = (select auth.uid()));
create policy opportunities_owner_update on public.opportunities for update to authenticated using (submitted_by = (select auth.uid())) with check (submitted_by = (select auth.uid()) and status in ('pending','rejected') and not is_verified);
create policy opportunities_trusted_publish on public.opportunities for insert to authenticated
  with check (public.can_contribute() and submitted_by = (select auth.uid()) and status = 'approved' and not is_verified);
create policy opportunities_admin_manage on public.opportunities for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lost_found_public_read on public.lost_found_items for select to anon, authenticated using (status = 'approved');
create policy lost_found_submit on public.lost_found_items for insert to authenticated with check (reporter_id = (select auth.uid()) and status = 'approved');
create policy lost_found_owner_update on public.lost_found_items for update to authenticated using (reporter_id = (select auth.uid())) with check (reporter_id = (select auth.uid()));
create policy lost_found_owner_delete on public.lost_found_items for delete to authenticated using (reporter_id = (select auth.uid()));
create policy lost_found_moderate on public.lost_found_items for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

create policy marketplace_public_read on public.marketplace_listings for select to anon, authenticated using (status = 'approved');
create policy marketplace_submit on public.marketplace_listings for insert to authenticated with check (seller_id = (select auth.uid()) and status = 'pending');
create policy marketplace_owner_read_update on public.marketplace_listings for select to authenticated using (seller_id = (select auth.uid()));
create policy marketplace_owner_update on public.marketplace_listings for update to authenticated using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()) and status in ('pending','approved','rejected'));
create policy marketplace_owner_delete on public.marketplace_listings for delete to authenticated using (seller_id = (select auth.uid()));
create policy marketplace_moderate on public.marketplace_listings for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

create policy community_posts_public_read on public.community_posts for select to anon, authenticated using (status = 'approved');
create policy community_posts_submit on public.community_posts for insert to authenticated with check (author_id = (select auth.uid()) and status = 'approved');
create policy community_posts_owner_update on public.community_posts for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()) and status in ('approved','pending','rejected'));
create policy community_posts_owner_delete on public.community_posts for delete to authenticated using (author_id = (select auth.uid()));
create policy community_posts_moderate on public.community_posts for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());
create policy post_comments_public_read on public.post_comments for select to anon, authenticated using (status = 'approved' and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'));
create policy post_comments_submit on public.post_comments for insert to authenticated with check (author_id = (select auth.uid()) and status = 'approved' and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'));
create policy post_comments_owner_update on public.post_comments for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy post_comments_owner_delete on public.post_comments for delete to authenticated using (author_id = (select auth.uid()));
create policy post_comments_moderate on public.post_comments for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());
create policy post_reactions_owner_read on public.post_reactions for select to authenticated using (user_id = (select auth.uid()));
create policy post_reactions_owner_insert on public.post_reactions for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'));
create policy post_reactions_owner_delete on public.post_reactions for delete to authenticated using (user_id = (select auth.uid()));

-- No public SELECT policy exists: private messages are visible only to participants/admins.
create policy contact_requests_participant_read on public.contact_requests for select to authenticated using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()) or public.is_admin());
create policy contact_requests_requester_create on public.contact_requests for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and (
      (target_type = 'marketplace_listing' and exists (select 1 from public.marketplace_listings m where m.id = target_id and m.status = 'approved' and not m.is_sold and m.seller_id = recipient_id))
      or
      (target_type = 'lost_found_item' and exists (select 1 from public.lost_found_items l where l.id = target_id and l.status = 'approved' and not l.is_recovered and l.reporter_id = recipient_id))
    )
  );
create policy contact_requests_recipient_update on public.contact_requests for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()) and requester_id <> recipient_id);
create policy contact_requests_participant_delete on public.contact_requests for delete to authenticated using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy contact_requests_admin_manage on public.contact_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy reports_submit on public.user_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_owner_read on public.user_reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy reports_moderate on public.user_reports for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

create policy tickets_owner_insert on public.support_tickets for insert to authenticated with check (requester_id = (select auth.uid()));
create policy tickets_owner_read_update on public.support_tickets for select to authenticated using (requester_id = (select auth.uid()));
create policy tickets_owner_close on public.support_tickets for update to authenticated using (requester_id = (select auth.uid())) with check (requester_id = (select auth.uid()) and status in ('open','closed'));
create policy tickets_admin_manage on public.support_tickets for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());
create policy replies_ticket_participant_read on public.support_replies for select to authenticated using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.requester_id = (select auth.uid()) or public.is_moderator_or_admin())));
create policy replies_owner_insert on public.support_replies for insert to authenticated with check (author_id = (select auth.uid()) and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.requester_id = (select auth.uid())));
create policy replies_admin_insert on public.support_replies for insert to authenticated with check (public.is_moderator_or_admin() and author_id = (select auth.uid()));
create policy replies_author_update on public.support_replies for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy replies_admin_manage on public.support_replies for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

create policy feedback_submit on public.feedback for insert to anon, authenticated
  with check ((is_anonymous and submitter_id is null) or (not is_anonymous and submitter_id = (select auth.uid())));
create policy feedback_owner_read on public.feedback for select to authenticated using (submitter_id = (select auth.uid()));
create policy feedback_admin_manage on public.feedback for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy notifications_recipient_read_update on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_recipient_update on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy notifications_admin_insert on public.notifications for insert to authenticated with check (public.is_moderator_or_admin());
create policy notifications_admin_manage on public.notifications for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

-- Storage buckets are empty configuration only; no files or credentials are seeded.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('academic-resources', 'academic-resources', false, 52428800, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp']),
  ('marketplace-images', 'marketplace-images', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('lost-found-images', 'lost-found-images', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('support-attachments', 'support-attachments', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;


-- Storage-object policies are provisioned separately through Supabase Storage policy management.
