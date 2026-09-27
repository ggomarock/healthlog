// 코드 수정해서 다시 올릴 때 버전 숫자를 올려줘 (v5 → v6) — 그래야 폰에 새 버전이 반영됨
const CACHE = 'healthlog-v5';
const FONTS = 'healthlog-fonts';   // 폰트는 버전이 바뀌어도 유지
const FILES = ['./', './index.html', './style.css', './data.js', './icons.js', './ui.js', './app.js', './analysis.js', './features.js',
  './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 폰트(jsDelivr): 한 번 받으면 캐시에서 → 오프라인에서도 Pretendard 유지
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(FONTS).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
      return r;
    }).catch(() => hit))));
    return;
  }
  if (url.origin !== location.origin) return;
  // 앱 파일: 네트워크 우선 → 실패(오프라인)하면 캐시
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
