const CACHE_NAME = 'registro-attivita-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

// Network-first for navigation/app shell, so updates are picked up when online;
// falls back to cache when offline. Firebase requests are left untouched (network only).
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') || url.includes('googleapis.com') || url.includes('gstatic.com')) {
    return; // let these go straight to network, don't interfere with Firebase
  }
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
