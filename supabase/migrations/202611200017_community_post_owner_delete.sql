-- Authenticated students may delete only posts authored by their own account.
-- Moderator/admin management access remains governed by the existing moderation policy.
drop policy if exists community_posts_owner_delete on public.community_posts;
create policy community_posts_owner_delete
  on public.community_posts
  for delete
  to authenticated
  using (author_id = (select auth.uid()));

revoke delete on table public.community_posts from public, anon;
grant delete on table public.community_posts to authenticated;
