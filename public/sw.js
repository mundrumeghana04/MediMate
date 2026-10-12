/**
 * ==============================================================================
 * MediMate - Service Worker (sw.js)
 * ==============================================================================
 * "Your personal healthcare companion."
 *
 * Provides Web Push notification event listening, notification clicks,
 * background reminder presentation, and asset caching for scheduled medicine doses.
 * Runs independently of open browser tabs.
 * ==============================================================================
 */

const CACHE_NAME = 'medimate-shell-v1';
const CRITICAL_ASSETS = [
  '/',
  '/assets/medimate-logo.jpg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CRITICAL_ASSETS).catch((err) => {
        console.warn('[SW Install Cache Warning]', err.message);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Purge outdated caches if any
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

/**
 * Handle push events dispatched from the server
 */
self.addEventListener('push', (event) => {
  let data = {
    title: 'MediMate Medicine Reminder',
    body: "It's time for your scheduled medicine dose.",
    icon: '/assets/medimate-logo.jpg',
    badge: '/assets/medimate-logo.jpg',
    tag: 'medimate-reminder',
    url: '/schedule'
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    }
  } catch (err) {
    if (event.data) {
      try {
        data.body = event.data.text() || data.body;
      } catch (textErr) {}
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/assets/medimate-logo.jpg',
    badge: data.badge || '/assets/medimate-logo.jpg',
    data: {
      url: (data.data && data.data.url) || data.url || '/schedule',
      timestamp: Date.now()
    },
    vibrate: [200, 100, 200],
    tag: data.tag || 'medimate-reminder',
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

/**
 * Handle user clicks on delivered notifications
 * Focuses the open schedule window or launches a fresh window.
 * Does not mark the dose as taken merely from being displayed or clicked.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/schedule';

  const fullUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      // Focus existing tab if open on this origin
      for (const client of clientList) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          if ('navigate' in client) {
            try {
              await client.navigate(fullUrl);
            } catch (navErr) {}
          }
          return client.focus();
        }
      }
      // Open new window if none active
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    })
  );
});
