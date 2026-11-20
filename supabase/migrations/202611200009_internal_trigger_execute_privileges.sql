-- Trigger-only helpers are invoked by PostgreSQL triggers, not by clients through RPC.
-- Revoke direct API execution while leaving the already-created triggers in place.
revoke all on function public.guard_academic_resource_directory() from public, anon, authenticated;
revoke all on function public.guard_community_post_author_context() from public, anon, authenticated;
