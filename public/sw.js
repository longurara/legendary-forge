// Service Worker cho PWA Lò Rèn Huyền Thoại — cache-first cho asset nặng, network-first cho mã nguồn
const CACHE = 'lorenh-v3';
const ASSET_PREFIXES = ['/models/', '/audio/', '/music/', '/sfx/', '/ui/', '/fx/'];

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
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/')) return;

  // Asset tĩnh lớn (mô hình 3D, âm thanh, nhạc, icon): cache-first để tải siêu nhanh & chơi offline
  if (ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })).catch(() => new Response('', { status: 504, statusText: 'Gateway Timeout' }))
    );
    return;
  }

  // Trang & JS/CSS: network-first, rớt mạng thì lấy bản cache (luôn trả về Response hợp lệ)
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || new Response('Offline', { status: 503, statusText: 'Offline' })))
  );
});
