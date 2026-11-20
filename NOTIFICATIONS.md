# CAMPORA phone notifications

CAMPORA uses browser Web Push with a Supabase Edge Function; there is no paid push-notification provider.

## How it works

1. A signed-in user taps the header bell to open their notification inbox. Selecting a notification opens its details and marks only that notification as read.
2. New accounts receive a saved welcome notification when their profile is created, so it appears in the inbox even before push is enabled.
3. Administrators can choose **App update** when publishing a noticeboard announcement. CAMPORA creates one notification for each active account when that update is first published; ordinary campus announcements do not create app-update alerts. Later edits do not resend the alert.
4. A signed-in user taps the header bell, opens **Phone settings**, and taps **Enable phone notifications**. The browser asks for permission only after that tap.
5. The browser's push subscription is registered through a security-definer RPC. The underlying `push_subscriptions` table is not readable or writable by client roles; the RPC associates one subscription endpoint with the signed-in account.
6. New rows in `public.notifications` trigger push delivery. The Postgres trigger queues a request using `pg_net`; a high-entropy shared value is generated in Supabase Vault and verified by the Edge Function through a server-role-only boolean RPC. Tapping a phone alert opens that exact notification in CAMPORA and marks it read after the signed-in app loads it.
7. The sender reads only the recipient's subscriptions using the server-side Supabase key, encrypts the notification with Web Push/VAPID, and removes endpoints the push service has expired.

## Required configuration

- Set `VITE_VAPID_PUBLIC_KEY` in local development and the Vercel project. It is public and may be included in browser builds.
- Keep `CAMPORA_VAPID_PRIVATE_KEY` only in Supabase Edge Function secrets. Never place it in Vite environment variables, source control, or browser code.
- Keep the matching public/private VAPID key pair stable. Rotating it requires users to enable notifications again on their devices.
- The migrations install `pg_net`, create the private subscription table and RPCs, generate the webhook secret in Vault, dispatch pushes from notification rows, and add the welcome/app-update notification events and read-state RPC.

## API access

The `net` schema contains `pg_net`'s outbound-request queue and headers; keep `net` out of Supabase PostgREST's exposed schemas. Production currently exposes only `public` and `graphql_public`. The migration role cannot revoke the extension-owned `net` ACLs, so this API boundary must remain in place.

Notification rows are readable only by their recipient. Client roles cannot update or delete notification rows directly; the `mark_campora_notification_read` RPC marks only the signed-in user's own notification as read and does not allow changing it back to unread.

## Phone notes
Use CAMPORA over HTTPS in a supported browser. On iPhone and iPad, add CAMPORA to the Home Screen and open the installed app before enabling web push. Users can turn off notifications per device in the CAMPORA phone settings.

## References

The [Supabase Management API bulk secret endpoint](https://supabase.com/docs/reference/api/v1-bulk-create-secrets) uses `POST /v1/projects/{ref}/secrets`, and the [secret-list endpoint](https://supabase.com/docs/reference/api/v1-list-all-secrets) can confirm names without displaying values. Supabase's [Edge Function security guide](https://supabase.com/docs/guides/functions/auth) recommends custom verification for external webhooks when platform JWT checks are disabled; its [API-key guide](https://supabase.com/docs/guides/getting-started/api-keys) distinguishes project keys from user authentication. For deployments, see Vercel's [Create Deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), which supports non-Git deployments from uploaded files.

- [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) documents the asynchronous `net.http_post` call used by the database trigger.
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets) explains how production function secrets are configured and read.
- [web-push](https://github.com/web-push-libs/web-push) documents VAPID configuration, Web Push payloads, and notification sending.
