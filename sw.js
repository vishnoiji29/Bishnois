/*
  सब्दवाणी ऐप — Service Worker
  =============================
  मकसद (क्यों बनाया):
   1) दूसरी बार ऐप खोलने पर सब कुछ (React/Tailwind/Fonts/पिछला डेटा) तुरंत दिखे — नेटवर्क का इंतज़ार नहीं।
   2) इंटरनेट न हो तब भी ऐप खुले और पिछली बार सुना/पढ़ा content दिखे (offline support)।
   3) एक बार सुना गया ऑडियो अगली बार बिना डाउनलोड हुए तुरंत बजे।

  यह फाइल index.html के ठीक बगल में repo root में होनी चाहिए (उसी जगह जहाँ index.html है)।
  Cache version बदलने पर (CACHE_VERSION अपडेट करके) पुराना cache अपने-आप साफ़ हो जाता है —
  इसलिए भविष्य में app की कोई नई cached copy अटक कर नहीं रह जाएगी।
*/

const CACHE_VERSION = 'sabadwani-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`; // audio, images, fonts

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
];

// जिन डोमेन को हम कैश करना चाहते हैं (CDN libs, fonts, GitHub/jsDelivr डेटा और ऑडियो)
const CACHEABLE_HOSTS = [
  'cdn.tailwindcss.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'raw.githubusercontent.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('sabadwani-') && ![SHELL_CACHE, DATA_CACHE, ASSET_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }

  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableHost = CACHEABLE_HOSTS.includes(url.hostname);
  if (!isSameOrigin && !isCacheableHost) return; // let it pass straight through (e.g. GitHub API calls)

  // डेटा JSON: network-first, cache को fallback की तरह रखो (हमेशा latest दिखाने की कोशिश,
  // पर नेटवर्क फेल हो तो पुराना cached डेटा दिखा दो — पूरी तरह ऑफलाइन काम करे इसलिए)
  if (url.pathname.endsWith('sabadwani-data.json')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ऑडियो/इमेज/फॉन्ट/CDN लाइब्रेरी: cache-first (एक बार डाउनलोड, फिर हमेशा तुरंत) —
  // ये फाइलें पब्लिश होने के बाद बदलती नहीं, इसलिए यह तरीका सुरक्षित और सबसे तेज़ है।
  const isAudio = /\.(mp3|wav|ogg|m4a)$/i.test(url.pathname);
  const isStaticAsset = isAudio || /\.(png|jpg|jpeg|webp|svg|woff2?|ttf|css|js)$/i.test(url.pathname) || url.hostname === 'cdn.tailwindcss.com' || url.hostname === 'unpkg.com';

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // बाकी सब (जैसे index.html खुद): network-first, offline होने पर shell cache से दिखाओ
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match('./index.html')))
  );
});
