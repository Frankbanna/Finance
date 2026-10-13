/**
 * ============================================================================
 * PERSONAL FINANCE MANAGER PRO - PWA SERVICE WORKER (sw.js)
 * ============================================================================
 * Caches application shell (HTML, CSS, JS, Fonts, Bootstrap, Chart.js)
 * so the web app opens and operates seamlessly even with 0 internet connection
 * on both Mobile (iOS/Android) and Desktop (Windows/Mac).
 * ============================================================================
 */

const CACHE_NAME = 'bank-bana-pwa-v1.6';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/styles.css',
  './js/config.js',
  './js/offline.js',
  './js/api.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/accounts.js',
  './js/transactions.js',
  './js/budgets.js',
  './js/goals.js',
  './js/recurring.js',
  './js/reports.js',
  './js/debts.js',
  './js/bills.js',
  './js/automation.js',
  './js/app.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => null)
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never intercept POST API calls in Service Worker; PFM_API + PFM_OFFLINE handles API caching & outbox sync
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);
  if (url.pathname === '/api' || url.pathname.includes('/macros/s/')) {
    return;
  }

  // Network-first for HTML navigation, falling back to cached index.html when offline
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Stale-while-revalidate for static assets (CSS, JS, CDN libraries, Fonts)
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

