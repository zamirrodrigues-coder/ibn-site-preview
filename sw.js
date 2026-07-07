// IBN Life — Service Worker (P15)
// Push notifications + minimal install lifecycle.
// No aggressive caching, no fetch handler.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch (_e) {
    try {
      payload = { title: "IBN Life", body: event.data?.text?.() || "Você tem uma nova notificação." };
    } catch {
      payload = {};
    }
  }
  const title = payload.title || "IBN Life";
  const body = payload.body || "Você tem uma nova notificação.";
  const url = payload.url || "/";
  const tag = payload.tag || "ibnlife-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      requireInteraction: false,
    })
  );
});

// VAPID public key — same value used by usePushNotifications.
const VAPID_PUBLIC_KEY =
  "BLKJTl1c3RC_Yz8PnCMczvvwvBKDYaRMCFihGZpebwxp2cdyUnKjDchWmgS_9moL9zLArH0XHWB08o3vReRiu3Y";

function urlB64ToUint8(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY),
        });
        // Best-effort notify clients to upsert in DB
        const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        for (const c of clientsList) {
          c.postMessage({
            type: "pushsubscriptionchange",
            oldEndpoint: event.oldSubscription?.endpoint ?? null,
            newSubscription: newSub.toJSON(),
          });
        }
      } catch (e) {
        console.error("[sw] pushsubscriptionchange failed", e);
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.pathname === targetUrl || client.url.endsWith(targetUrl)) {
            await client.focus();
            return;
          }
        } catch {}
      }
      if (allClients[0]) {
        try {
          await allClients[0].focus();
          await allClients[0].navigate(targetUrl);
          return;
        } catch {}
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
