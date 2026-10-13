// Service Worker: macht Code Kontor installierbar und lädt die Oberfläche auch bei schlechtem Netz.
// API-Aufrufe werden nie zwischengespeichert, Geschäftsdaten kommen immer frisch vom Server.
const CACHE = "code-kontor-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    // Seiten: zuerst Netz, sonst die gespeicherte Startseite
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }
  // Dateien (JS, CSS, Bilder): aus dem Speicher, im Hintergrund aktualisieren
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
      return cached || network;
    }),
  );
});
