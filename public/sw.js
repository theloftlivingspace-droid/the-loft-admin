// sw.js — receives Web Push and sets/clears the iOS home-screen app badge.
// Requires the app to be added to Home Screen (iOS 16.4+) for setAppBadge to work.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const count = typeof data.count === 'number' ? data.count : 0;

  event.waitUntil(
    (async () => {
      try {
        if (count > 0 && 'setAppBadge' in self.registration) {
          await self.registration.setAppBadge(count);
        } else if ('clearAppBadge' in self.registration) {
          await self.registration.clearAppBadge();
        }
      } catch (e) {
        console.error('[sw] badge error', e);
      }

      await self.registration.showNotification(data.title || 'Loft Admin', {
        body: data.body || '',
        icon: '/icons/icon-admin.png',
        badge: '/icons/icon-admin.png',
        tag: 'loft-admin-badge',
        renotify: false,
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (allClients.length > 0) {
        await allClients[0].focus();
      } else {
        await clients.openWindow('/');
      }
    })()
  );
});
