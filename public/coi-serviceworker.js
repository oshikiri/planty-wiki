/* global self */
// Based on https://github.com/gzuidhof/coi-serviceworker (MIT).
// Simplified for Planty Wiki to register once, attach COOP/COEP headers, and cache app resources.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: The bootstrap must handle both window and worker contexts.
(() => {
  const CACHE_NAME = "planty-wiki-app-v1";

  const isWindowContext =
    typeof window !== "undefined" && typeof document !== "undefined" && self === window;

  if (isWindowContext) {
    if (!("serviceWorker" in navigator)) {
      console.warn("COI service worker is unavailable in this browser.");
      return;
    }

    const reloadKey = "coiReloadedBySelf";
    const hasReloaded = window.sessionStorage.getItem(reloadKey) === "true";
    const markReloaded = () => {
      window.sessionStorage.setItem(reloadKey, "true");
    };

    const scriptElement =
      document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
    const swUrl = new URL(scriptElement?.src || "./coi-serviceworker.js", window.location.href);
    const scopeUrl = new URL("./", swUrl);
    navigator.serviceWorker
      .register(swUrl, { scope: scopeUrl.pathname })
      .then(() => {
        if (navigator.serviceWorker.controller || hasReloaded) {
          return;
        }
        markReloaded();
        window.location.reload();
      })
      .catch((error) => {
        console.warn("Failed to register COI service worker.", error);
      });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasReloaded) {
        return;
      }
      markReloaded();
      window.location.reload();
    });

    return;
  }

  self.addEventListener("install", (event) => {
    event.waitUntil(Promise.all([self.skipWaiting(), cacheAppShell()]));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(Promise.all([self.clients.claim(), removeOldCaches()]));
  });

  self.addEventListener("fetch", (event) => {
    event.respondWith(handleFetch(event.request));
  });

  async function handleFetch(request) {
    if (isCacheableRequest(request)) {
      return attachIsolationHeaders(await fetchWithOfflineFallback(request));
    }
    return attachIsolationHeaders(await fetch(request));
  }

  async function cacheAppShell() {
    const cache = await caches.open(CACHE_NAME);
    const appShellUrl = new URL("./", self.registration.scope).href;
    const response = await fetch(new Request(appShellUrl, { cache: "no-cache" }));
    if (!response.ok) {
      throw new Error(`Failed to cache app shell: ${response.status}`);
    }
    await cache.put(appShellUrl, response);
  }

  async function removeOldCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("planty-wiki-app-") && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)),
    );
  }

  function isCacheableRequest(request) {
    if (request.method !== "GET") {
      return false;
    }

    const url = new URL(request.url);
    if (
      url.origin !== self.location.origin ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/signin-with-chatgpt") ||
      url.pathname.startsWith("/signout-with-chatgpt")
    ) {
      return false;
    }

    const appShellPath = new URL("./", self.registration.scope).pathname;
    if (request.mode === "navigate") {
      return url.pathname === appShellPath;
    }

    return (
      ["font", "image", "manifest", "script", "style", "worker"].includes(request.destination) ||
      url.pathname.endsWith(".wasm")
    );
  }

  async function fetchWithOfflineFallback(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      if (request.mode === "navigate") {
        const appShellUrl = new URL("./", self.registration.scope).href;
        const appShell = await cache.match(appShellUrl);
        if (appShell) {
          return appShell;
        }
      }

      throw new Error("Network unavailable and no cached resource exists.");
    }
  }

  function attachIsolationHeaders(response) {
    if (!response || response.type === "opaque" || response.type === "opaqueredirect") {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    const body = [204, 205, 304].includes(response.status) ? null : response.body;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
})();
