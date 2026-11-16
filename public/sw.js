const CACHE = 'fitplan-v50';
const CORE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/splash.jpg',
  '/splash/spartan.png',
  '/splash/storm.jpg',
  '/splash/clouds.jpg',
  '/splash/helmet.jpg',
  '/plan.jpg',
  '/direct.jpg',
  '/pick.jpg',
  '/part-chest.jpg',
  '/part-back.jpg',
  '/part-arm.jpg',
  '/part-core.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 只处理本站的 GET；外部接口（大模型 API）一律不缓存、不拦截
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // /api 是会话和订阅状态，缓存下来会让你以为还登着
  if (url.pathname.startsWith('/api/')) return;
  // 落地页不接管：navigate 回写会把落地页 HTML 污染进应用壳缓存
  if (url.pathname.startsWith('/landing/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
