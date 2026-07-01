const CACHE_NAME = "ce-kumasi1-v2";
const STATIC_ASSETS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Receive a Web Push message and show an OS notification
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}

  const title   = data.title ?? "Christ Embassy Kumasi 1";
  const options = {
    body:      data.body ?? "",
    icon:      data.icon ?? "/icon-192.png",
    badge:     "/icon-192.png",
    tag:       data.tag ?? "ce-kumasi1",
    renotify:  true,
    data:      { url: data.url ?? "/my-notifications" },
    vibrate:   [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Open (or focus) the app when a notification is tapped, then navigate to the target URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/my-notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          return client.focus().then((c) => {
            if (c && "navigate" in c) return c.navigate(targetUrl);
          });
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
