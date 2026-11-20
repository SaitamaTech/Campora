import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, LoaderCircle, Smartphone } from 'lucide-react';
import { Modal } from './ui';
import { supabase } from '../lib/supabase';

type Props = {
  open: boolean;
  authenticated: boolean;
  configured: boolean;
  onClose: () => void;
  onSignIn: () => void;
};
type PushState = 'checking' | 'on' | 'off' | 'unsupported' | 'denied' | 'ios-install';

const applicationServerKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

export function NotificationSettings({ open, authenticated, configured, onClose, onSignIn }: Props) {
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !authenticated || !configured) return;
    void refreshSubscription();
  }, [open, authenticated, configured]);

  async function refreshSubscription() {
    const unsupported = getUnsupportedReason();
    if (unsupported) {
      setState(unsupported);
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    if (!applicationServerKey) {
      setState('unsupported');
      setError('Phone notifications are not configured for this CAMPORA build yet.');
      return;
    }
    setState('checking');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setState('off');
        return;
      }
      await saveSubscription(subscription);
      setState('on');
    } catch (cause) {
      setState('off');
      setError(cause instanceof Error ? cause.message : 'Could not check this device’s notification setting.');
    }
  }

  async function enableNotifications() {
    setBusy(true);
    setError('');
    try {
      if (!supabase || !configured || !authenticated) throw new Error('Sign in to CAMPORA to enable phone notifications.');
      if (!applicationServerKey) throw new Error('Phone notifications are not configured for this CAMPORA build yet.');
      const unsupported = getUnsupportedReason();
      if (unsupported) {
        setState(unsupported);
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(applicationServerKey),
      });
      await saveSubscription(subscription);
      setState('on');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enable phone notifications on this device.');
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setError('');
    try {
      if (!supabase) throw new Error('CAMPORA’s notification service is not connected.');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { error: removeError } = await supabase.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint });
        if (removeError) throw removeError;
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not turn off phone notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSubscription(subscription: PushSubscription) {
    if (!supabase) throw new Error('CAMPORA’s notification service is not connected.');
    const serialized = subscription.toJSON();
    const p256dh = serialized.keys?.p256dh;
    const auth = serialized.keys?.auth;
    if (!subscription.endpoint || !p256dh || !auth) throw new Error('This browser returned an incomplete push subscription.');
    const { error: saveError } = await supabase.rpc('register_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
    });
    if (saveError) throw saveError;
  }

  const displayState = !authenticated || !configured ? 'off' : state;
  const blocked = displayState === 'unsupported' || displayState === 'denied' || displayState === 'ios-install';
  const title = displayState === 'on' ? 'Notifications are on for this device' : 'Get CAMPORA alerts on your phone';
  return open ? <Modal title="Phone notifications" onClose={() => { setError(''); onClose(); }}>
    <div className="phone-notification-settings">
      <div className={`phone-notification-status ${displayState === 'on' ? 'is-on' : ''}`}>
        <span className="phone-notification-icon">{displayState === 'on' ? <Check size={22} /> : <Smartphone size={22} />}</span>
        <div><b>{title}</b><p>{displayState === 'on' ? 'New CAMPORA notifications can arrive even when the app is not open.' : 'Allow alerts for new CAMPORA notifications on this browser and device.'}</p></div>
      </div>

      {displayState === 'checking' && <div className="phone-notification-note"><LoaderCircle size={16} className="spin" /> Checking this device…</div>}
      {displayState === 'ios-install' && <div className="phone-notification-note"><Smartphone size={16} /> On iPhone or iPad, first add CAMPORA to your Home Screen, open it there, then enable notifications.</div>}
      {displayState === 'denied' && <div className="phone-notification-note">Notifications are blocked in this browser. Allow them in your browser’s site settings, then return here.</div>}
      {displayState === 'unsupported' && <div className="phone-notification-note">This browser or CAMPORA build does not currently support phone notifications. Try an up-to-date browser over HTTPS.</div>}
      {!authenticated && <div className="phone-notification-note">Sign in to CAMPORA before enabling notifications for your account.</div>}
      {authenticated && !configured && <div className="phone-notification-note">Connect CAMPORA to its live account service before enabling notifications.</div>}
      <p className="phone-notification-privacy">This setting applies to this browser on this device. You can turn it off here at any time.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions phone-notification-actions">
        <button className="button button-quiet" onClick={() => { setError(''); onClose(); }}>Close</button>
        {!authenticated ? <button className="button button-primary" onClick={() => { setError(''); onSignIn(); }}><Bell size={15} /> Sign in to enable</button>
          : displayState === 'on' ? <button className="button button-quiet phone-notification-off" onClick={() => void disableNotifications()} disabled={busy}><BellOff size={15} /> {busy ? 'Turning off…' : 'Turn off on this device'}</button>
          : <button className="button button-primary" onClick={() => void enableNotifications()} disabled={busy || blocked || !configured}><Bell size={15} /> {busy ? 'Enabling…' : 'Enable phone notifications'}</button>}
      </div>
    </div>
  </Modal> : null;
}

function getUnsupportedReason(): PushState | null {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (isIOS && !isInstalled) return 'ios-install';
  return null;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
