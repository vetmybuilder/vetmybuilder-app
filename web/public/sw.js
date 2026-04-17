/* eslint-disable no-restricted-globals */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "VetMyBuilder";
  const options = {
    body: data.body || "",
    icon: "/favicon.ico",
    data: { linkPath: data.linkPath || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const linkPath = event.notification.data?.linkPath || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(linkPath) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(linkPath);
    }),
  );
});
