-- Local migration for student-submitted Opportunities and Lost & Found posts.
-- Apply only after the project owner approves the production database change.
-- Existing approved rows are intentionally left unchanged.

-- New lost-and-found submissions start in the moderation queue and are only
-- inserted by authenticated users through the pending-only policy.
alter table public.lost_found_items
  alter column status set default 'pending';

drop policy if exists lost_found_submit on public.lost_found_items;
create policy lost_found_submit
  on public.lost_found_items
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'pending'
    and not is_recovered
    and nullif(btrim(location_description), '') is not null
  );

-- Remove the trusted-contributor bypass: student opportunity submissions must
-- always wait for an administrator review, even when submitted by contributors.
drop policy if exists opportunities_trusted_publish on public.opportunities;
drop policy if exists opportunities_submit on public.opportunities;
create policy opportunities_submit
  on public.opportunities
  for insert
  to authenticated
  with check (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and not is_verified
    and source is not null
    and length(btrim(source)) between 2 and 240
    and reviewed_by is null
    and reviewed_at is null
  );

-- RLS is the primary boundary; this trigger also protects the moderation fields
-- against accidental future grants or permissive policies.
create or replace function public.protect_opportunity_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending'
       or new.is_verified
       or new.source is null
       or length(btrim(new.source)) not between 2 and 240
       or new.reviewed_by is not null
       or new.reviewed_at is not null then
      raise exception 'Student opportunities must be submitted pending and unverified';
    end if;
  elsif old.status is distinct from new.status
     or old.is_verified is distinct from new.is_verified
     or old.reviewed_by is distinct from new.reviewed_by
     or old.reviewed_at is distinct from new.reviewed_at then
    raise exception 'Only an administrator may approve or verify opportunities';
  end if;

  return new;
end;
$$;

drop trigger if exists opportunities_protect_moderation_fields on public.opportunities;
create trigger opportunities_protect_moderation_fields
  before insert or update on public.opportunities
  for each row
  execute function public.protect_opportunity_moderation_fields();

revoke all on function public.protect_opportunity_moderation_fields() from public, anon, authenticated;
