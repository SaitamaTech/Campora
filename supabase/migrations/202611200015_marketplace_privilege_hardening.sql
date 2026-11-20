-- Remove Supabase default broad grants from classifieds support tables.
-- RLS remains the row-level authority; these grants also limit which operations clients can attempt.

revoke all on table public.marketplace_images from public, anon, authenticated;
grant select, insert, update, delete on public.marketplace_images to authenticated;
grant select on public.marketplace_images to anon;

revoke all on table public.marketplace_reports from public, anon, authenticated;
grant insert (reporter_id, report_type, listing_id, seller_id, reason) on public.marketplace_reports to authenticated;
grant select, update, delete on public.marketplace_reports to authenticated;

revoke all on table public.marketplace_listing_views from public, anon, authenticated;
grant select on public.marketplace_listing_views to authenticated;
