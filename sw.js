// Service Worker для Segway Russia
// v3 - блокировка видео для мобильных устройств
const CACHE_NAME = 'segway-v3';
const urlsToCache = [
  './',
  './index.html',
  // CSS файлы
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlib-base.3e21fb49801385d0ff2bda0061858216.css',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/index.css',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlibs.2cd565ad58bf00268c9edf5eb26c650b.css',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlibs.1a1738743712784f3d13e2ba3bc6bcc1.css',
  // JS файлы
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/jquery.1fc733054ddb2e2fcd4a0f763671047b.js',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlib-base.30c83cb63e47404cfb20b9f8f03ef7b6.js',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlib-vendors.af8a67a35a3d1f9665c662b14715869d.js',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlibs.a174ff097ccc2a1662e279b67aef404c.js',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/index.js',
  './fix_mobile_video_global.min.js',
  // Основные WebP изображения
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/TopBanner_Xyber_PC.webp',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/TopBanner_Xyber_M.webp',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/TopBanner_Xafari_PC.webp',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/TopBanner_Xafari_M.webp',
  './local_assets/is/content/ninebotstage/F2z_P_1.webp',
  './local_assets/is/content/ninebotstage/F2z_M_1.webp',
  // Шрифты
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Exo+2:wght@300;400;500;700&display=swap&subset=cyrillic'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const isMobile = /Mobile|Android/i.test(
    event.request.headers.get('User-Agent') || ''
  );
  
  // Блокируем видео на мобильных
  if (isMobile && event.request.url.endsWith('.mp4')) {
    event.respondWith(new Response('', { status: 204 }));
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
EOF < /dev/null