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

// N'intercepte volontairement RIEN : ni les requêtes non-GET (connexion,
// actions serveur, écriture de données), ni les appels vers un autre
// domaine (l'API Supabase Auth/PostgREST, sur un sous-domaine distinct).
// Un simple `fetch(event.request)` de repassage est censé être transparent,
// mais laisser le navigateur traiter nativement tout ce qui n'a pas besoin
// de passer par le service worker élimine par construction tout risque
// d'interférence avec l'authentification ou les écritures.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});
