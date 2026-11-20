-- Seed only departments explicitly identified as departments on official UNILESA pages.
-- The official homepage's faculty menus and /admission-program catalogue contain programme names;
-- those names are not copied into departments unless a source explicitly labels them as departments.
--
-- Basic Medical Sciences: official UNILESA newsletter identifies the Department of Public Health.
-- https://www.unilesa.edu.ng/static/frontpage/media/newsletter/unilesa_news_letter_vol2_03_2025I.pdf
-- Law: the Public and International Law page states the three Senate-approved departments.
-- https://www.unilesa.edu.ng/law/public_international
-- Nursing Sciences: official faculty page explicitly labels five Academic Departments.
-- https://www.unilesa.edu.ng/nursing-history
-- Faculty list reference: https://www.unilesa.edu.ng/
-- Programme catalogue (not used as a department source): https://www.unilesa.edu.ng/admission-program

with wanted(faculty_name, department_name) as (
  values
    ('Basic Medical Sciences', 'Public Health'),
    ('Law', 'Public and International Law'),
    ('Law', 'Private and Commercial Law'),
    ('Law', 'Islamic and Customary Law'),
    ('Nursing Sciences', 'Community & Public Health Nursing'),
    ('Nursing Sciences', 'Mental Health & Psychiatric Nursing'),
    ('Nursing Sciences', 'Maternal & Child Health Nursing'),
    ('Nursing Sciences', 'Medical-Surgical Nursing'),
    ('Nursing Sciences', 'Nursing Administration, Education & Informatics')
), mapped as (
  select f.id as faculty_id, w.department_name as name
  from public.faculties f
  join wanted w on lower(btrim(f.name)) = lower(w.faculty_name)
  where f.is_active
  limit 50
)
insert into public.departments (faculty_id, name)
select faculty_id, name from mapped
on conflict (faculty_id, name) do update set is_active = true;

-- Keep profile-photo objects private and limited to the formats accepted by the UI.
with avatar_bucket as (
  select id from storage.buckets where id = 'avatars' limit 1
)
update storage.buckets b
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[],
    updated_at = now()
from avatar_bucket a
where b.id = a.id;
