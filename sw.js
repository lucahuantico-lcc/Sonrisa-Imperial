// Service worker de Sonrisa Imperial: permite instalar la página como app
// y abrirla aunque no haya internet. Al cambiar la lista de archivos, sube la versión.
const VERSION = "sonrisa-v3";

// Archivos propios que se guardan al instalar la app
const PRECACHE = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/app/",
  "/app/app.css",
  "/app/app.js",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/img/icon-192.png",
  "/img/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

// Borra las versiones viejas del caché
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo archivos propios de esta landing: no tocar fotos externas, mapas,
  // WhatsApp ni las páginas de otros clientes publicadas en /clientes/
  if (request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/clientes/")) {
    return;
  }

  // Primero internet, para mostrar siempre la última versión publicada.
  // Si no hay conexión, se usa la copia guardada.
  const key = request.mode === "navigate" ? (url.pathname.startsWith("/app") ? "/app/" : "/") : request;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(key, copy));
        }
        return response;
      })
      .catch(() => caches.match(key))
  );
});
