import { createClient } from 'npm:@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

interface NotificationRow {
  id: string;
  recipient_id: string;
  title: string;
  body: string | null;
}
interface DatabaseWebhook {
  type: string;
  schema: string;
  table: string;
  record: NotificationRow;
}
interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function keyFromEnvironment(dictionaryName: string, legacyName: string): string | undefined {
  const raw = Deno.env.get(dictionaryName);
  if (raw) {
    try {
      const values = JSON.parse(raw) as Record<string, string>;
      const selected = values.default || Object.values(values)[0];
      if (selected) return selected;
    } catch {
      // Fall through to the legacy single-key variable.
    }
  }
  return Deno.env.get(legacyName);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const secretKey = keyFromEnvironment('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('CAMPORA_VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('CAMPORA_VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('CAMPORA_VAPID_SUBJECT') || 'https://campora-puce.vercel.app';
  const webhookSecret = request.headers.get('x-campora-push-secret');

  if (!projectUrl || !secretKey || !vapidPublicKey || !vapidPrivateKey) {
    console.error('CAMPORA push delivery is missing server configuration.');
    return json({ error: 'Push delivery is not configured.' }, 503);
  }
  if (!webhookSecret) return json({ error: 'Unauthorized.' }, 401);

  try {
    const admin = createClient(projectUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authorized, error: verificationError } = await admin.rpc('verify_campora_push_webhook_secret', {
      p_secret: webhookSecret,
    });
    if (verificationError || authorized !== true) return json({ error: 'Unauthorized.' }, 401);

    const event = await request.json() as DatabaseWebhook;
    const row = event?.record;
    if (event?.type !== 'INSERT' || event?.schema !== 'public' || event?.table !== 'notifications'
      || !row || typeof row.id !== 'string' || typeof row.recipient_id !== 'string'
      || typeof row.title !== 'string') {
      return json({ error: 'Invalid notification event.' }, 400);
    }

    const { data: subscriptions, error: selectError } = await admin
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('user_id', row.recipient_id)
      .limit(10);
    if (selectError) {
      console.error('Could not load CAMPORA push subscriptions:', selectError.message);
      return json({ error: 'Could not load notification devices.' }, 500);
    }
    if (!subscriptions?.length) return json({ sent: 0, removed: 0 });

    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const results = await Promise.all((subscriptions as StoredSubscription[]).map(async (subscription) => {
      if (!isKnownPushService(subscription.endpoint)) return { sent: false, removed: true, id: subscription.id };
      try {
        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({
          id: row.id,
          title: row.title,
          body: typeof row.body === 'string' ? row.body : '',
          url: '/#home',
        }), { TTL: 3600, urgency: 'normal' });
        return { sent: true, removed: false, id: subscription.id };
      } catch (cause) {
        const statusCode = Number((cause as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) return { sent: false, removed: true, id: subscription.id };
        console.warn('CAMPORA push provider rejected a notification; endpoint details were omitted.', statusCode || 'unknown');
        return { sent: false, removed: false, id: subscription.id };
      }
    }));

    const staleIds = results.filter((result) => result.removed).map((result) => result.id);
    if (staleIds.length) {
      const { error: deleteError } = await admin.from('push_subscriptions').delete().in('id', staleIds);
      if (deleteError) console.warn('Could not remove expired CAMPORA push subscriptions.');
    }
    return json({
      sent: results.filter((result) => result.sent).length,
      removed: staleIds.length,
    });
  } catch (cause) {
    console.error('CAMPORA push dispatch failed:', cause instanceof Error ? cause.message : 'unknown error');
    return json({ error: 'Notification delivery failed.' }, 500);
  }
});

function isKnownPushService(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'fcm.googleapis.com'
      || host === 'android.googleapis.com'
      || host === 'web.push.apple.com'
      || host === 'updates.push.services.mozilla.com'
      || host === 'push.services.mozilla.com'
      || host.endsWith('.push.services.mozilla.com');
  } catch {
    return false;
  }
}
