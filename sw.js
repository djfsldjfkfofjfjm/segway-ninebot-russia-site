// Service Worker для Segway Russia
const CACHE_NAME = 'segway-v1';
const urlsToCache = [
  './',
  './index.html',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlib-base.3e21fb49801385d0ff2bda0061858216.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
EOF < /dev/null