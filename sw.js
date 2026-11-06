/* Service worker — permite usar la app sin conexión.
   Estrategia:
   - App shell (HTML/CSS/JS/iconos): cache-first con actualización en segundo plano.
   - Datos (data/… y json/…): cache-first; una vez visitados, quedan sin conexión.
   Sube CACHE_VERSION cuando cambie la app para refrescar la caché. */
const CACHE_VERSION = "biblia-v19";
const SHELL = [
  "./",
  "index.html",
  "assets/css/app.css",
  "assets/js/app.js",
  "assets/js/data.js",
  "assets/js/store.js",
  "manifest.webmanifest",
  "assets/icons/icon.svg",
  "data/books.json",
  "data/versions.json",
  "data/strongs_he_es.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // refresca en segundo plano si hay red
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("index.html"));
    })
  );
});
