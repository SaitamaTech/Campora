import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, BellRing, CheckCheck, Clock3, Settings2 } from 'lucide-react';
import { EmptyState, Modal } from './ui';
import type { CamporaNotification } from '../lib/types';

type Props = {
  open: boolean;
  authenticated: boolean;
  loading: boolean;
  notifications: CamporaNotification[];
  initialNotificationId?: string;
  onClose: () => void;
  onSignIn: () => void;
  onOpenSettings: () => void;
  onMarkRead: (id: string) => Promise<void>;
};

export function NotificationInbox({ open, authenticated, loading, notifications, initialNotificationId, onClose, onSignIn, onOpenSettings, onMarkRead }: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [dismissedInitialId, setDismissedInitialId] = useState('');
  const [error, setError] = useState('');
  const handledInitialIds = useRef(new Set<string>());
  const activeSelectedId = selectedId || (initialNotificationId && initialNotificationId !== dismissedInitialId ? initialNotificationId : '');
  const selected = notifications.find((notification) => notification.id === activeSelectedId);
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  async function openNotification(notification: CamporaNotification) {
    setSelectedId(notification.id);
    setError('');
    if (notification.is_read) return;
    try {
      await onMarkRead(notification.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not mark this notification as read.');
    }
  }

  useEffect(() => {
    if (!open || !initialNotificationId || !notifications.length || handledInitialIds.current.has(initialNotificationId)) return;
    const notification = notifications.find((item) => item.id === initialNotificationId);
    if (!notification) return;
    handledInitialIds.current.add(initialNotificationId);
    if (!notification.is_read) {
      void onMarkRead(notification.id).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not mark this notification as read.'));
    }
  }, [open, initialNotificationId, notifications, onMarkRead]);

  if (!open) return null;
  const title = selected ? 'Notification' : 'Notifications';

  return <Modal title={title} onClose={() => { setSelectedId(''); setError(''); onClose(); }}>
    {!authenticated ? <div className="notification-guest">
      <span className="notification-inbox-icon"><Bell size={20} /></span>
      <h3>Stay in the loop</h3>
      <p>Sign in to see your welcome message and CAMPORA updates.</p>
      <button className="button button-primary" onClick={onSignIn}>Sign in to CAMPORA</button>
    </div> : selected ? <div className="notification-detail">
      <button className="notification-back" onClick={() => { setSelectedId(''); setDismissedInitialId(initialNotificationId || ''); setError(''); }}><ArrowLeft size={15} /> All notifications</button>
      <span className={`notification-kind ${selected.notification_type === 'app_update' ? 'is-update' : ''}`}>
        {notificationLabel(selected.notification_type)}
      </span>
      <h3>{selected.title}</h3>
      {selected.body && <p className="notification-detail-body">{selected.body}</p>}
      <small><Clock3 size={14} /> {formatNotificationDate(selected.created_at)}</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-quiet notification-detail-done" onClick={() => { setSelectedId(''); setDismissedInitialId(initialNotificationId || ''); setError(''); }}>Done</button>
    </div> : <div className="notification-inbox">
      <div className="notification-inbox-top">
        <span>{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</span>
        <button className="small-link" onClick={onOpenSettings}><Settings2 size={14} /> Phone settings</button>
      </div>
      {loading ? <div className="notification-loading"><span className="spin" /> Loading notifications…</div>
        : notifications.length ? <div className="notification-list">{notifications.map((notification) => <button key={notification.id} className={`notification-row ${notification.is_read ? '' : 'is-unread'}`} onClick={() => void openNotification(notification)}>
          <span className="notification-row-icon">{notification.notification_type === 'app_update' ? <BellRing size={17} /> : notification.is_read ? <Bell size={17} /> : <BellRing size={17} />}</span>
          <span className="notification-row-copy">
            <span className="notification-row-heading"><b>{notification.title}</b>{!notification.is_read && <i aria-label="Unread" />}</span>
            <span className="notification-row-body">{notification.body || 'Open to view this CAMPORA notification.'}</span>
            <span className="notification-row-meta"><span>{notificationLabel(notification.notification_type)}</span><span>{formatNotificationDate(notification.created_at)}</span></span>
          </span>
        </button>)}</div>
        : <EmptyState title="No notifications yet" text="Your welcome message and new CAMPORA app updates will appear here." icon={<CheckCheck size={20} />} />}
    </div>}
  </Modal>;
}

function notificationLabel(type: string) {
  if (type === 'app_update') return 'CAMPORA app update';
  if (type === 'welcome') return 'Welcome';
  return type.replaceAll('_', ' ');
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
