-- Keep notification rows server-managed; authenticated users can only mark their own rows read via RPC.
revoke delete on table public.notifications from public, anon, authenticated;
