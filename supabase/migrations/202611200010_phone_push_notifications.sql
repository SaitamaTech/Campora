-- CAMPORA phone notifications: Web Push subscriptions and secure delivery hook.
-- The webhook secret is generated inside Supabase Vault and never stored in the repository.

create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 16 and 2048 and endpoint like 'https://%'),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to service_role;

-- Create one secret for the database-to-function request. The value is never returned by this migration.
do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'campora_push_webhook_secret'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'campora_push_webhook_secret',
      'Authenticates internal CAMPORA notification delivery requests.'
    );
  end if;
end
$$;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription_count integer;
begin
  if v_user_id is null then
    raise exception 'Sign in is required to register phone notifications.' using errcode = '28000';
  end if;
  if p_endpoint is null or length(p_endpoint) not between 16 and 2048 or p_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception 'Invalid push endpoint.' using errcode = '22023';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{40,200}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{10,128}$' then
    raise exception 'Invalid push subscription keys.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = v_user_id and is_active) then
    raise exception 'An active CAMPORA account is required.' using errcode = '42501';
  end if;

  select count(*) into v_subscription_count
  from public.push_subscriptions
  where user_id = v_user_id and endpoint <> p_endpoint;
  if v_subscription_count >= 10 then
    raise exception 'This account already has the maximum number of notification devices.' using errcode = '54000';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_user_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to remove a phone notification device.' using errcode = '28000';
  end if;
  delete from public.push_subscriptions
  where user_id = auth.uid() and endpoint = p_endpoint;
end;
$$;

revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- This boolean-only RPC lets the sender verify a Vault secret without exposing it to callers.
create or replace function public.verify_campora_push_webhook_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select coalesce(
    (select decrypted_secret = p_secret
     from vault.decrypted_secrets
     where name = 'campora_push_webhook_secret'
     limit 1),
    false
  );
$$;

revoke all on function public.verify_campora_push_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.verify_campora_push_webhook_secret(text) to service_role;

create or replace function public.dispatch_campora_notification_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
  v_webhook_secret text;
begin
  select decrypted_secret into v_webhook_secret
  from vault.decrypted_secrets
  where name = 'campora_push_webhook_secret'
  limit 1;

  if v_webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://yqzuxrcmbuxrhcexgmxz.supabase.co/functions/v1/dispatch-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-campora-push-secret', v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', tg_table_schema,
      'table', tg_table_name,
      'record', to_jsonb(new),
      'old_record', null
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'Unable to queue CAMPORA phone notification (SQLSTATE %).', SQLSTATE;
  return new;
end;
$$;

revoke all on function public.dispatch_campora_notification_push() from public, anon, authenticated;

-- pg_net's queue contains the shared webhook header, so it must not be readable by app roles.
revoke all on schema net from public, anon, authenticated;
revoke all on all tables in schema net from public, anon, authenticated;

create trigger notifications_dispatch_phone_push
  after insert on public.notifications
  for each row execute function public.dispatch_campora_notification_push();
