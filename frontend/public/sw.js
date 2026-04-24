/* global self, clients */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Sentinel", body: event.data ? String(event.data.text()) : "" };
  }
  const title = data.title || "Sentinel";
  const body = data.body || "";
  const url = typeof data.url === "string" && data.url ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: "/favicon.svg",
      badge: "/favicon.svg"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  const abs = new URL(url, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url === abs && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(abs);
    })()
  );
});
