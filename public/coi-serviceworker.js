/* global self */
// Based on https://github.com/gzuidhof/coi-serviceworker (MIT).
// Simplified for Planty Wiki to register once and attach COOP/COEP headers.
(function () {
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

    navigator.serviceWorker
      .register("/coi-serviceworker.js", { scope: "./" })
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
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });

  self.addEventListener("fetch", (event) => {
    event.respondWith(attachIsolationHeaders(event.request));
  });

  async function attachIsolationHeaders(request) {
    const response = await fetch(request);
    if (!response || response.type === "opaque" || response.type === "opaqueredirect") {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
})();
