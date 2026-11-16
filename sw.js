// Service worker: zorgt dat de app offline werkt.
// Verander VERSION bij elke nieuwe uitgave, zodat telefoons de nieuwe bestanden ophalen.
const VERSION = 'woordkoffer-1.1.4';
const FILES = [
  './', 'index.html', 'styles.css', 'vertalingen.js', 'lijsten.js', 'lijsten-sv.js', 'app.js', 'manifest.json',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eerst het netwerk (altijd de nieuwste versie), met de cache als reserve als er geen verbinding is
// of het netwerk langer dan 3 seconden nodig heeft.
// Alleen de eigen bestanden; verzoeken naar andere sites (zoals GoatCounter) gaan er gewoon langs.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // 'no-cache': altijd bij de server nagaan of er een nieuwere versie is.
    const network = fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (err) { /* offline */ }
    const cached = await cache.match(e.request, { ignoreSearch: true });
    return cached || network;
  })());
});
