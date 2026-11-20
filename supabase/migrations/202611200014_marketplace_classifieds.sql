-- CAMPORA marketplace classifieds hardening and extension.
-- Additive classifieds extension for the existing CAMPORA schema.

create table if not exists public.marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  listing_type text not null check (listing_type in ('product','service')),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (listing_type, name),
  unique (listing_type, slug)
);

create or replace function public.marketplace_category_type_guard()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if old.listing_type is distinct from new.listing_type and exists (select 1 from public.marketplace_listings l where l.category_id = old.id) then
    raise exception 'A category in use cannot change between products and services';
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_category_type_guard on public.marketplace_categories;
create trigger marketplace_category_type_guard before update of listing_type on public.marketplace_categories for each row execute function public.marketplace_category_type_guard();

alter table public.marketplace_listings
  add column if not exists listing_type text not null default 'product' check (listing_type in ('product','service')),
  add column if not exists category_id uuid references public.marketplace_categories(id) on delete set null,
  add column if not exists price_type text not null default 'fixed' check (price_type in ('fixed','negotiable','contact')),
  add column if not exists listing_status text not null default 'active' check (listing_status in ('active','sold','unavailable')),
  add column if not exists seller_display_name text,
  add column if not exists location text,
  add column if not exists landmark text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists moderation_reason text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create table if not exists public.marketplace_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null check (length(storage_path) between 1 and 1024 and storage_path not like '%..%'),
  position smallint not null default 0 check (position between 0 and 4),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (listing_id, storage_path)
);

create table if not exists public.marketplace_listing_contacts (
  listing_id uuid primary key references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  phone_number text,
  whatsapp_number text,
  contact_email text,
  show_phone boolean not null default false,
  show_whatsapp boolean not null default false,
  show_email boolean not null default false,
  preferred_contact_method text check (preferred_contact_method is null or preferred_contact_method in ('phone','whatsapp','email')),
  legacy_contact_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (show_phone = false or nullif(btrim(phone_number), '') is not null),
  check (show_whatsapp = false or nullif(btrim(whatsapp_number), '') is not null),
  check (show_email = false or nullif(btrim(contact_email), '') is not null),
  check (preferred_contact_method is null or (preferred_contact_method = 'phone' and show_phone) or (preferred_contact_method = 'whatsapp' and show_whatsapp) or (preferred_contact_method = 'email' and show_email))
);

create table if not exists public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  report_type text not null check (report_type in ('listing','seller')),
  listing_id uuid references public.marketplace_listings(id) on delete cascade,
  seller_id uuid references public.profiles(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 2 and 1000),
  status public.report_status not null default 'open',
  reviewed_by uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((report_type = 'listing' and listing_id is not null and seller_id is null)
      or (report_type = 'seller' and seller_id is not null and listing_id is not null))
);

create table if not exists public.marketplace_listing_views (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (listing_id, viewer_id, viewed_on)
);

-- Preserve legacy contact values privately, without exposing contact_method itself.
insert into public.marketplace_listing_contacts (listing_id, seller_id, legacy_contact_note)
select l.id, l.seller_id, l.contact_method
from public.marketplace_listings l
where l.contact_method is not null
on conflict (listing_id) do update
set seller_id = excluded.seller_id,
    legacy_contact_note = coalesce(public.marketplace_listing_contacts.legacy_contact_note, excluded.legacy_contact_note);

insert into public.marketplace_categories (name, slug, listing_type, sort_order)
values
 ('Phones and Accessories','phones-and-accessories','product',10), ('Laptops and Computers','laptops-and-computers','product',20), ('Electronics','electronics','product',30),
 ('Clothing and Fashion','clothing-and-fashion','product',40), ('Shoes and Bags','shoes-and-bags','product',50), ('Books and Academic Materials','books-and-academic-materials','product',60),
 ('Furniture','furniture','product',70), ('Beauty and Personal Care','beauty-and-personal-care','product',80), ('Food and Snacks','food-and-snacks','product',90),
 ('Sports Equipment','sports-equipment','product',100), ('Home Appliances','home-appliances','product',110), ('Other Products','other-products','product',120),
 ('Graphic Design','graphic-design','service',10), ('Web Development','web-development','service',20), ('Programming','programming','service',30),
 ('Photography','photography','service',40), ('Video Editing','video-editing','service',50), ('Tutoring','tutoring','service',60),
 ('Catering','catering','service',70), ('Hair Styling and Beauty','hair-styling-and-beauty','service',80), ('Laundry Services','laundry-services','service',90),
 ('Repairs and Maintenance','repairs-and-maintenance','service',100), ('Printing and Document Services','printing-and-document-services','service',110),
 ('Transportation','transportation','service',120), ('Other Services','other-services','service',130)
on conflict (listing_type, name) do nothing;

-- Retain existing private image paths as gallery records and preserve the legacy primary order.
insert into public.marketplace_images (listing_id, seller_id, storage_path, position, is_primary)
select l.id, l.seller_id, image.path, (image.ordinality - 1)::smallint, image.ordinality = 1
from public.marketplace_listings l
cross join lateral jsonb_array_elements_text(l.image_paths) with ordinality as image(path, ordinality)
where image.ordinality <= 5
on conflict (listing_id, storage_path) do nothing;

update public.marketplace_listings
set listing_status = case when is_sold then 'sold' else 'active' end,
    price_type = case when price is null then 'contact' else 'fixed' end,
    seller_display_name = coalesce(seller_display_name, (select p.full_name from public.profiles p where p.id = seller_id))
where listing_status is null or seller_display_name is null;

alter table public.marketplace_listings
  add constraint marketplace_price_type_consistent
  check ((price_type = 'contact' and price is null) or (price_type in ('fixed','negotiable') and price is not null));

update public.marketplace_listings l
set category_id = c.id
from public.marketplace_categories c
where l.category_id is null
  and c.listing_type = case when l.category::text = 'student_services' then 'service' else 'product' end
  and c.slug = case l.category::text
    when 'textbooks' then 'books-and-academic-materials'
    when 'electronics' then 'electronics'
    when 'fashion' then 'clothing-and-fashion'
    when 'accommodation' then 'other-products'
    when 'student_services' then 'other-services'
    else 'other-products'
  end;

create index if not exists marketplace_categories_type_idx on public.marketplace_categories(listing_type, is_active, sort_order);
create index if not exists marketplace_classifieds_public_idx on public.marketplace_listings(status, listing_status, listing_type, created_at desc);
create index if not exists marketplace_classifieds_category_idx on public.marketplace_listings(category_id, status, listing_status);
create index if not exists marketplace_classifieds_featured_idx on public.marketplace_listings(is_featured, status, listing_status, created_at desc);
create index if not exists marketplace_images_listing_idx on public.marketplace_images(listing_id, position);
create unique index if not exists marketplace_images_primary_unique on public.marketplace_images(listing_id) where is_primary;
create index if not exists marketplace_views_listing_day_idx on public.marketplace_listing_views(listing_id, viewed_on);
create index if not exists marketplace_reports_status_idx on public.marketplace_reports(status, created_at desc);

create or replace function public.marketplace_listing_guard()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  moderator boolean := public.is_moderator_or_admin();
  admin boolean := public.is_admin();
  meaningful boolean;
begin
  if new.category_id is not null and not exists (select 1 from public.marketplace_categories c where c.id = new.category_id and c.listing_type = new.listing_type) then
    raise exception 'Marketplace category must match listing type';
  end if;
  if not moderator and not exists (select 1 from public.profiles p where p.id = new.seller_id and p.is_active) then
    raise exception 'Only active CAMPORA accounts may manage marketplace listings';
  end if;
  if tg_op = 'INSERT' then
    if not moderator then
      new.status := 'pending';
      new.is_featured := false;
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
    if moderator and new.status = 'rejected' and nullif(btrim(new.moderation_reason), '') is null then
      raise exception 'A moderation reason is required when rejecting a listing';
    end if;
    new.seller_display_name := coalesce(nullif(btrim(new.seller_display_name), ''), (select p.full_name from public.profiles p where p.id = new.seller_id));
    if new.listing_status = 'sold' then new.is_sold := true; new.sold_at := coalesce(new.sold_at, now()); end if;
    return new;
  end if;

  if not admin and old.is_featured is distinct from new.is_featured then
    raise exception 'Only administrators may feature marketplace listings';
  end if;
  if not moderator and (old.moderation_reason is distinct from new.moderation_reason or old.reviewed_by is distinct from new.reviewed_by or old.reviewed_at is distinct from new.reviewed_at) then
    raise exception 'Only moderators or administrators may change marketplace review metadata';
  end if;
  if old.status is distinct from new.status and not moderator then
    raise exception 'Only moderators or administrators may change marketplace moderation status';
  end if;
  if moderator and new.status = 'rejected' and nullif(btrim(new.moderation_reason), '') is null then
    raise exception 'A moderation reason is required when rejecting a listing';
  end if;
  if not moderator then
    meaningful := old.title is distinct from new.title or old.description is distinct from new.description
      or old.category is distinct from new.category or old.price is distinct from new.price
      or old.currency_code is distinct from new.currency_code or old.image_paths is distinct from new.image_paths
      or old.listing_type is distinct from new.listing_type or old.category_id is distinct from new.category_id
      or old.price_type is distinct from new.price_type or old.seller_display_name is distinct from new.seller_display_name
      or old.location is distinct from new.location or old.landmark is distinct from new.landmark;
    if meaningful and old.status in ('approved','rejected') then
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.moderation_reason := null;
    end if;
  end if;
  if new.listing_status = 'sold' then new.is_sold := true; new.sold_at := coalesce(new.sold_at, now());
  elsif new.listing_status <> 'sold' and old.listing_status = 'sold' and not moderator then raise exception 'Only moderators may reopen sold listings';
  else new.is_sold := false; new.sold_at := null; end if;
  return new;
end;
$$;

drop trigger if exists marketplace_classifieds_guard on public.marketplace_listings;
create trigger marketplace_classifieds_guard before insert or update on public.marketplace_listings for each row execute function public.marketplace_listing_guard();

drop trigger if exists marketplace_contacts_updated_at on public.marketplace_listing_contacts;
create trigger marketplace_contacts_updated_at before update on public.marketplace_listing_contacts for each row execute function public.set_updated_at();
drop trigger if exists marketplace_reports_updated_at on public.marketplace_reports;
create trigger marketplace_reports_updated_at before update on public.marketplace_reports for each row execute function public.set_updated_at();

create or replace function public.marketplace_image_guard()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if new.seller_id is distinct from (select seller_id from public.marketplace_listings where id = new.listing_id) then raise exception 'Image seller must match listing seller'; end if;
  if split_part(new.storage_path, '/', 1) <> new.seller_id::text then raise exception 'Image path must begin with seller UUID'; end if;
  if (select count(*) from public.marketplace_images where listing_id = new.listing_id and id <> coalesce(new.id, gen_random_uuid())) >= 5 then raise exception 'A listing may have at most five images'; end if;
  return new;
end;
$$;
drop trigger if exists marketplace_images_guard on public.marketplace_images;
create trigger marketplace_images_guard before insert or update on public.marketplace_images for each row execute function public.marketplace_image_guard();

create or replace function public.marketplace_contact_guard()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if new.seller_id <> (select seller_id from public.marketplace_listings where id = new.listing_id) then raise exception 'Contact seller must match listing seller'; end if;
  return new;
end;
$$;
drop trigger if exists marketplace_contacts_guard on public.marketplace_listing_contacts;
create trigger marketplace_contacts_guard before insert or update on public.marketplace_listing_contacts for each row execute function public.marketplace_contact_guard();

create or replace function public.marketplace_report_guard()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if new.report_type = 'listing' and not exists (select 1 from public.marketplace_listings l where l.id = new.listing_id) then
    raise exception 'Reported listing does not exist';
  end if;
  if new.report_type = 'seller' and not exists (select 1 from public.marketplace_listings l where l.id = new.listing_id and l.seller_id = new.seller_id) then
    raise exception 'Reported seller must match the listing seller';
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_reports_guard on public.marketplace_reports;
create trigger marketplace_reports_guard before insert or update on public.marketplace_reports for each row execute function public.marketplace_report_guard();

revoke all on function public.marketplace_category_type_guard() from public, anon, authenticated;
revoke all on function public.marketplace_listing_guard() from public, anon, authenticated;
revoke all on function public.marketplace_image_guard() from public, anon, authenticated;
revoke all on function public.marketplace_contact_guard() from public, anon, authenticated;
revoke all on function public.marketplace_report_guard() from public, anon, authenticated;

-- Replace legacy marketplace policies with the stricter classifieds visibility rules.
drop policy if exists marketplace_public_read on public.marketplace_listings;
drop policy if exists marketplace_submit on public.marketplace_listings;
drop policy if exists marketplace_owner_read_update on public.marketplace_listings;
drop policy if exists marketplace_owner_update on public.marketplace_listings;
drop policy if exists marketplace_owner_delete on public.marketplace_listings;
drop policy if exists marketplace_moderate on public.marketplace_listings;
create policy marketplace_classifieds_public_read on public.marketplace_listings for select to anon, authenticated using (status = 'approved' and listing_status = 'active' and exists (select 1 from public.profiles p where p.id = seller_id and p.is_active));
create policy marketplace_classifieds_owner_read on public.marketplace_listings for select to authenticated using (seller_id = (select auth.uid()));
create policy marketplace_classifieds_moderator_read on public.marketplace_listings for select to authenticated using (public.is_moderator_or_admin());
create policy marketplace_classifieds_submit on public.marketplace_listings for insert to authenticated with check (seller_id = (select auth.uid()) and status = 'pending' and not is_featured);
create policy marketplace_classifieds_owner_update on public.marketplace_listings for update to authenticated using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));
create policy marketplace_classifieds_owner_delete on public.marketplace_listings for delete to authenticated using (seller_id = (select auth.uid()));
create policy marketplace_classifieds_moderate on public.marketplace_listings for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

alter table public.marketplace_categories enable row level security;
create policy marketplace_categories_public_read on public.marketplace_categories for select to anon, authenticated using (is_active);
create policy marketplace_categories_admin_manage on public.marketplace_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.marketplace_images enable row level security;
create policy marketplace_images_owner_manage on public.marketplace_images for all to authenticated using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));
create policy marketplace_images_moderator_read on public.marketplace_images for select to authenticated using (public.is_moderator_or_admin());
create policy marketplace_images_public_read on public.marketplace_images for select to anon, authenticated using (exists (select 1 from public.marketplace_listings l join public.profiles p on p.id = l.seller_id where l.id = listing_id and l.status = 'approved' and l.listing_status = 'active' and p.is_active));

alter table public.marketplace_listing_contacts enable row level security;
create policy marketplace_contacts_owner_manage on public.marketplace_listing_contacts for all to authenticated using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));

alter table public.marketplace_reports enable row level security;
create policy marketplace_reports_submit on public.marketplace_reports for insert to authenticated with check (reporter_id = (select auth.uid()) and (report_type = 'listing' or (report_type = 'seller' and seller_id is not null)));
create policy marketplace_reports_owner_read on public.marketplace_reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy marketplace_reports_moderate on public.marketplace_reports for all to authenticated using (public.is_moderator_or_admin()) with check (public.is_moderator_or_admin());

alter table public.marketplace_listing_views enable row level security;
create policy marketplace_views_owner_read on public.marketplace_listing_views for select to authenticated using (viewer_id = (select auth.uid()));

-- Explicitly prevent broad reads of the legacy table and omit contact_method.
revoke all on table public.marketplace_listings from anon, authenticated;
grant select (id, seller_id, title, description, category, price, currency_code, image_paths, status, is_sold, sold_at, created_at, updated_at, listing_type, category_id, price_type, listing_status, seller_display_name, location, landmark, is_featured, moderation_reason) on public.marketplace_listings to anon, authenticated;
grant insert (seller_id, title, description, category, price, currency_code, image_paths, listing_type, category_id, price_type, listing_status, seller_display_name, location, landmark) on public.marketplace_listings to authenticated;
grant update (title, description, category, price, currency_code, image_paths, listing_type, category_id, price_type, listing_status, seller_display_name, location, landmark, is_sold, sold_at, status, is_featured, moderation_reason, reviewed_by, reviewed_at) on public.marketplace_listings to authenticated;
grant delete on public.marketplace_listings to authenticated;
revoke all on public.marketplace_categories from anon, authenticated;
grant select on public.marketplace_categories to anon, authenticated;
grant insert, update, delete on public.marketplace_categories to authenticated;
grant select, insert, update, delete on public.marketplace_images to authenticated;
grant select on public.marketplace_images to anon;
grant insert (reporter_id, report_type, listing_id, seller_id, reason) on public.marketplace_reports to authenticated;
grant select on public.marketplace_reports to authenticated;
grant update, delete on public.marketplace_reports to authenticated;
grant select on public.marketplace_listing_views to authenticated;
revoke all on table public.marketplace_listing_contacts from anon, authenticated;
grant select, insert, update on public.marketplace_listing_contacts to authenticated;

-- Keep the private bucket at the classifieds limit and preserve owner-prefixed uploads.
update storage.buckets set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'marketplace-images';
drop policy if exists campora_fetch_approved_marketplace_images on storage.objects;
create policy campora_fetch_approved_marketplace_images on storage.objects for select to public using (
  bucket_id = 'marketplace-images' and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
  and exists (select 1 from public.marketplace_images i join public.marketplace_listings l on l.id = i.listing_id where i.storage_path = storage.objects.name and ((l.status = 'approved' and l.listing_status = 'active' and exists (select 1 from public.profiles p where p.id = l.seller_id and p.is_active)) or l.seller_id = (select auth.uid()) or public.is_moderator_or_admin()))
  or bucket_id = 'marketplace-images' and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
  and exists (select 1 from public.marketplace_listings l where l.image_paths @> jsonb_build_array(storage.objects.name) and ((l.status = 'approved' and l.listing_status = 'active' and exists (select 1 from public.profiles p where p.id = l.seller_id and p.is_active)) or l.seller_id = (select auth.uid()) or public.is_moderator_or_admin()))
);
drop policy if exists campora_delete_own_orphaned_files on storage.objects;
create policy campora_delete_own_orphaned_files on storage.objects for delete to authenticated using (
  bucket_id in ('avatars', 'academic-resources', 'marketplace-images', 'lost-found-images', 'support-attachments')
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not exists (select 1 from public.profiles p where p.avatar_path = storage.objects.name)
  and not exists (select 1 from public.academic_resources r where r.storage_path = storage.objects.name)
  and not exists (select 1 from public.marketplace_listings l where l.image_paths @> jsonb_build_array(storage.objects.name))
  and not exists (select 1 from public.marketplace_images i where i.storage_path = storage.objects.name)
  and not exists (select 1 from public.lost_found_items i where i.image_path = storage.objects.name)
  and not exists (select 1 from public.support_tickets t where t.attachment_paths @> jsonb_build_array(storage.objects.name))
);

create or replace function public.get_marketplace_contacts(p_listing_ids uuid[])
returns table (listing_id uuid, phone_number text, whatsapp_number text, contact_email text, preferred_contact_method text)
language sql stable security definer set search_path = public, auth
as $$
  select c.listing_id, case when c.show_phone then c.phone_number end, case when c.show_whatsapp then c.whatsapp_number end, case when c.show_email then c.contact_email end, c.preferred_contact_method
  from public.marketplace_listing_contacts c join public.marketplace_listings l on l.id = c.listing_id join public.profiles p on p.id = l.seller_id
  where c.listing_id = any(coalesce(p_listing_ids, array[]::uuid[])) and l.status = 'approved' and l.listing_status = 'active' and p.is_active
    and (c.show_phone or c.show_whatsapp or c.show_email);
$$;
revoke execute on function public.get_marketplace_contacts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_marketplace_contacts(uuid[]) to anon, authenticated;

create or replace function public.search_marketplace_listings(p_query text, p_listing_type text, p_category_id uuid, p_min_price numeric, p_max_price numeric, p_location text, p_sort text, p_limit integer, p_offset integer, p_featured boolean)
returns table (listing_id uuid, total_count bigint, view_count bigint)
language sql stable security definer set search_path = public, auth
as $$
  with filtered as (
    select l.id, count(*) over () total_count, coalesce(v.view_count,0) view_count
    from public.marketplace_listings l left join (select listing_id, count(*) view_count from public.marketplace_listing_views where viewed_on >= current_date - 6 group by listing_id) v on v.listing_id=l.id
    where l.status='approved' and l.listing_status='active' and exists (select 1 from public.profiles p where p.id=l.seller_id and p.is_active) and (nullif(btrim(p_query),'') is null or l.title ilike '%'||btrim(p_query)||'%' or l.description ilike '%'||btrim(p_query)||'%' or l.category::text ilike '%'||btrim(p_query)||'%' or exists (select 1 from public.marketplace_categories c where c.id=l.category_id and (c.name ilike '%'||btrim(p_query)||'%' or c.slug ilike '%'||btrim(p_query)||'%')))
      and (p_listing_type is null or l.listing_type=p_listing_type) and (p_category_id is null or l.category_id=p_category_id)
      and (p_min_price is null or l.price >= p_min_price) and (p_max_price is null or l.price <= p_max_price)
      and (nullif(btrim(p_location),'') is null or l.location ilike '%'||btrim(p_location)||'%') and (p_featured is null or l.is_featured=p_featured)
    order by case when p_sort='oldest' then l.created_at end asc, case when p_sort='price_low' then l.price end asc nulls last, case when p_sort='price_high' then l.price end desc nulls last, case when p_sort='popular' then coalesce(v.view_count,0) end desc, l.created_at desc
    limit greatest(1, least(coalesce(p_limit,24),100)) offset greatest(0,coalesce(p_offset,0))
  ) select id, total_count, view_count from filtered;
$$;
revoke execute on function public.search_marketplace_listings(text,text,uuid,numeric,numeric,text,text,integer,integer,boolean) from public, anon, authenticated;
grant execute on function public.search_marketplace_listings(text,text,uuid,numeric,numeric,text,text,integer,integer,boolean) to anon, authenticated;

create or replace function public.marketplace_public_stats()
returns table (active_total bigint, product_total bigint, service_total bigint)
language sql stable security definer set search_path = public, auth as $$
 select count(*), count(*) filter (where l.listing_type='product'), count(*) filter (where l.listing_type='service') from public.marketplace_listings l where l.status='approved' and l.listing_status='active' and exists (select 1 from public.profiles p where p.id=l.seller_id and p.is_active);
$$;
grant execute on function public.marketplace_public_stats() to public;

create or replace function public.record_marketplace_listing_view(p_listing_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if (select auth.uid()) is null or not exists (select 1 from public.marketplace_listings l join public.profiles p on p.id=l.seller_id where l.id=p_listing_id and l.status='approved' and l.listing_status='active' and p.is_active) then return false; end if;
  insert into public.marketplace_listing_views(listing_id,viewer_id) values(p_listing_id,(select auth.uid())) on conflict do nothing;
  return true;
end;$$;
revoke execute on function public.record_marketplace_listing_view(uuid) from public, anon;
grant execute on function public.record_marketplace_listing_view(uuid) to authenticated;

create or replace function public.marketplace_popular_listing_counts(p_listing_ids uuid[])
returns table (listing_id uuid, view_count bigint) language sql stable security definer set search_path=public,auth as $$
 select l.id, count(v.id) from public.marketplace_listings l join public.profiles p on p.id=l.seller_id and p.is_active left join public.marketplace_listing_views v on v.listing_id=l.id and v.viewed_on >= current_date - 6 where l.id=any(coalesce(p_listing_ids,array[]::uuid[])) and l.status='approved' and l.listing_status='active' group by l.id;
$$;
revoke execute on function public.marketplace_popular_listing_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.marketplace_popular_listing_counts(uuid[]) to anon, authenticated;
