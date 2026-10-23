/* Lumen — service worker
   Estratègia: "app shell" en memòria cau (cache-first) perquè l'app funcioni sense connexió.
   Totes les rutes són relatives, així funciona dins d'una subcarpeta (GitHub Pages: usuari.github.io/repo/).
   Quan publiquis una nova versió, puja el número de CACHE_VERSION. */
const CACHE_VERSION = 'lumen-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './css/style.css',
  './fonts/instrument-serif-400.woff2',
  './fonts/instrument-serif-400-italic.woff2',
  './fonts/hanken-grotesk-var.woff2',
  './js/i18n.js',
  './js/geometry.js',
  './js/engine.js',
  './js/app.js',
  './js/crop.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegació: xarxa primer (per agafar versions noves), amb alternativa a la memòria cau.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Resta de recursos: memòria cau primer, i s'actualitza en segon pla.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
