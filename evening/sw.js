/**
 * sw.js
 * 缓存优先策略：首次访问后全量离线可用。
 * 版本号变更时激活阶段清理旧缓存。
 */
const CACHE_NAME = 'evening-v64';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './styles-secondary.css',
  './workout-data.js',
  './storage.js',
  './audio.js',
  './engine.js',
  './settings.js',
  './records.js',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // sw.js 自身走网络优先，保证部署新版本后能及时更新
  if (new URL(event.request.url).pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // JS 文件走网络优先：历史根因——真机微信 SW 缓存把 audio.js 卡在旧版，
  // 导致代码改动长期不生效。JS 逻辑更新必须及时生效，故绕过 cache-first。
  if (new URL(event.request.url).pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
