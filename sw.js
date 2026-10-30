// Service Worker: hält die App offline verfügbar.
// Bei Änderungen an den Dateien die Versionsnummer erhöhen.
const CACHE = 'toths-v16';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/db.js',
  'js/core.js',
  'js/service.js',
  'js/v-finanzen.js',
  'js/v-extras.js',
  'js/v-material.js',
  'js/v-auswertung.js',
  'js/v-gruendung.js',
  'js/v-suche.js',
  'js/vendor/jspdf.umd.min.js',
  'js/vendor/html2canvas.min.js',
  'js/v-start.js',
  'js/v-objekte.js',
  'js/v-einsaetze.js',
  'js/v-rechnungen.js',
  'js/v-berichte.js',
  'js/v-einstellungen.js',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Netzwerk zuerst (damit Updates ankommen), bei fehlender Verbindung aus dem Cache
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
