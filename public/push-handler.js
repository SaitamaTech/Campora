self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'CAMPORA';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: '/campora-icon.svg',
    badge: '/campora-icon.svg',
    tag: typeof payload.id === 'string' ? `campora-${payload.id}` : 'campora-notification',
    data: { url: typeof payload.url === 'string' ? payload.url : '/#home' },
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/#home', self.location.origin);
  if (destination.origin !== self.location.origin) destination.href = `${self.location.origin}/#home`;

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (!existing) return self.clients.openWindow(destination.href);
    return existing.navigate(destination.href).then((navigated) => (navigated || existing).focus());
  }));
});
