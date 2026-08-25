// Service worker minimal : satisfait le critère d'installabilité PWA
// (manifest + service worker actif) sans mettre en cache les données de
// l'application — l'agenda, les validations, etc. doivent toujours refléter
// l'état réel du serveur, jamais une version mise en cache.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
