// Service Worker для оптимизации производительности
const CACHE_NAME = 'segway-v1';
const urlsToCache = [
  './',
  './segway_optimized.html',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/clientlib-base.3e21fb49801385d0ff2bda0061858216.css',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/index.css',
  './Welcome to Segway ,Your Premier Choice for Personal Transportation_files/jquery.1fc733054ddb2e2fcd4a0f763671047b.js',
  './video-lazy-load.js'
];

// Установка Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Кеширование основных ресурсов');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Активация Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Удаление старого кеша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Обработка запросов
self.addEventListener('fetch', event => {
  // Стратегия: сеть, затем кеш
  if (event.request.url.includes('.mp4')) {
    // Видео файлы - не кешируем, загружаем по требованию
    return;
  }
  
  // Для изображений используем кеш с обновлением в фоне
  if (event.request.url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
    return;
  }
  
  // Для остальных ресурсов - сеть, затем кеш
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Проверяем валидность ответа
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Клонируем ответ
        const responseToCache = response.clone();
        
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        
        return response;
      })
      .catch(() => {
        // Если сеть недоступна, берем из кеша
        return caches.match(event.request);
      })
  );
});

// Предзагрузка критических ресурсов
self.addEventListener('message', event => {
  if (event.data.action === 'preloadResources') {
    const resourcesToPreload = event.data.resources;
    
    caches.open(CACHE_NAME).then(cache => {
      resourcesToPreload.forEach(resource => {
        fetch(resource).then(response => {
          cache.put(resource, response);
        });
      });
    });
  }
});