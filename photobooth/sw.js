/* Snapbooth — minimal offline shell (works on GitHub Pages subpaths) */
const CACHE = 'snapbooth-v4';

function baseDir() {
  const p = self.location.pathname;
  return p.endsWith('/sw.js') ? p.slice(0, -'sw.js'.length) : p.replace(/[^/]+$/, '');
}

function assetUrls() {
  const base = self.location.origin + baseDir();
  return ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest'].map((f) => new URL(f, base).href);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(assetUrls()))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        try {
          const u = new URL(event.request.url);
          if (res.ok && /\.(css|js|webmanifest)$/i.test(u.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
        } catch (_) {
          /* ignore */
        }
        return res;
      });
    })
  );
});
