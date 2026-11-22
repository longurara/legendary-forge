// Service Worker cho PWA Lò Rèn Huyền Thoại — cache-first cho asset nặng, network-first cho mã nguồn
const CACHE = 'lorenh-v2';
const ASSET_PREFIXES = ['/models/', '/audio/', '/music/', '/ui/', '/fx/'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/manifest.json', '/ui/app-icon.svg'])).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Asset tĩnh lớn (mô hình 3D, âm thanh, nhạc, icon): cache-first để tải siêu nhanh & chơi offline
  if (ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  // Trang & JS/CSS: network-first, rớt mạng thì lấy bản cache
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
