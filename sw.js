// Service worker de Sonrisa Imperial: permite instalar la página como app
// y abrirla aunque no haya internet. Al cambiar la lista de archivos, sube la versión.
const VERSION = "sonrisa-v5";

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

  // Solo archivos propios de esta landing: no tocar fotos externas, mapas, WhatsApp,
  // el servidor de avisos (/api/) ni las páginas de otros clientes en /clientes/
  if (
    request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/clientes/") ||
    url.pathname.startsWith("/api/")
  ) {
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

/* ---------- Notificaciones ---------- */

// Llega un aviso del servidor: se muestra aunque la app esté cerrada
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Sonrisa Imperial", {
      body: data.body || "",
      icon: "/img/icon-192.png",
      badge: "/img/icon-192.png",
      // Mismo tag = reemplaza al aviso anterior del mismo tipo en lugar de acumularse
      tag: data.tag || "sonrisa-imperial",
      data: { url: data.url || "/app/" },
    })
  );
});

// Al tocar la notificación se abre la app (o se trae al frente si ya estaba abierta)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const app = clients.find((client) => new URL(client.url).pathname.startsWith("/app"));
      if (app) {
        app.navigate(target);
        return app.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
