// Çevrimdışı çalışma: önce önbellek, arka planda güncelle
const CACHE = 'memo-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/fsrs.js', 'js/conj.js', 'js/parser.js', 'js/store.js', 'js/dict.js', 'js/tts.js', 'js/ui.js', 'js/study.js', 'js/sheet.js', 'js/listen.js', 'js/request.js',
  'content/index.json', 'content/temel.txt', 'content/b1.txt', 'content/b2.txt', 'content/kimya.txt', 'content/metinler-b1.txt', 'content/metinler-b2.txt', 'content/metinler-kimya.txt',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
