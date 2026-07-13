// sw.js — receives Web Push and sets/clears the iOS home-screen app badge.
// Requires the app to be added to Home Screen (iOS 16.4+) for setAppBadge to work.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const PUSH_API_BASE = 'https://hotel-line-bot.onrender.com';

// Reports what happened when trying to set the badge, since iOS gives no
// visible error to the user and Safari Web Inspector isn't always handy.
function reportBadgeDebug(fields) {
  return fetch(`${PUSH_API_BASE}/push/debug-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userAgent: self.navigator ? self.navigator.userAgent : null,
      standalone: self.matchMedia ? self.matchMedia('(display-mode: standalone)').matches : null,
      ...fields,
    }),
  }).catch(() => {});
}

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
      const badgeApiAvailable = 'setAppBadge' in self.navigator;
      try {
        if (count > 0 && badgeApiAvailable) {
          await self.navigator.setAppBadge(count);
          await reportBadgeDebug({ event: 'setAppBadge_ok', count, badgeApiAvailable });
        } else if ('clearAppBadge' in self.navigator) {
          await self.navigator.clearAppBadge();
          await reportBadgeDebug({ event: 'clearAppBadge_ok', count, badgeApiAvailable });
        } else {
          await reportBadgeDebug({ event: 'no_badge_api', count, badgeApiAvailable });
        }
      } catch (e) {
        console.error('[sw] badge error', e);
        await reportBadgeDebug({ event: 'badge_error', count, badgeApiAvailable, error: String(e && e.message || e) });
      }

      if (data.silent) return; // count went to 0 — clear badge only, no banner

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
