// Network-first service worker: always tries to fetch the latest version (so updates
// arrive on the next launch) and falls back to the cache when offline. The vendored
// speech toolkit never changes under its versioned path, so it's served cache-first.
// The speech model has its own cache (modelStore.js), which updates here must not delete.

const CACHE = 'shower-math-v5';
const VENDOR_CACHE = 'shower-math-vendor-v1';
const OWN_CACHES = /^shower-math-v\d+$/;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'package.json',
  'css/style.css',
  'js/main.js',
  'js/settings.js',
  'js/game.js',
  'js/generator.js',
  'js/hebrewNumbers.js',
  'js/commands.js',
  'js/answerMatcher.js',
  'js/echoGrace.js',
  'js/localSpeech.js',
  'js/modelStore.js',
  'js/asrWorker.js',
  'js/micWorklet.js',
  'js/speech.js',
  'js/sounds.js',
  'js/wakelock.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => OWN_CACHES.test(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.open(VENDOR_CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
