/* Scope is deliberately limited to /wordwin/. The build stamps this version. */
const SHELL = "wordwin-shell-__BUILD__";
const DATA = "wordwin-data-ro-5.1-v1";
const BASE = "/wordwin/";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(BASE + "build-assets.json", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("App files unavailable");
      const assets = await response.json();
      const cache = await caches.open(SHELL);
      await cache.addAll(assets.map((path) => BASE + path));
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if ((key.startsWith("wordwin-shell-") && key !== SHELL) || key === "wordwin-data-v1")
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(BASE)
  )
    return;
  event.respondWith(
    (async () => {
      const isData = /\/(ocr|dictionaries)\//.test(url.pathname);
      const cache = await caches.open(isData ? DATA : SHELL);
      if (event.request.mode === "navigate") {
        try {
          const response = await fetch(event.request);
          if (response.ok) await cache.put(BASE, response.clone());
          return response;
        } catch {
          return (
            (await cache.match(BASE, { ignoreVary: true })) ||
            (await cache.match(BASE + "index.html", { ignoreVary: true })) ||
            Response.error()
          );
        }
      }
      const cached = (await cache.match(event.request, { ignoreVary: true })) ||
        (isData && await (await caches.open(SHELL)).match(event.request, { ignoreVary: true }));
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })(),
  );
});
