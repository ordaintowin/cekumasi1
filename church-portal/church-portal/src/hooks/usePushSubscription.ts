import { useEffect, useRef, useState } from "react";

const getToken = () => (typeof localStorage !== "undefined" ? localStorage.getItem("token") : null);

export type PushStatus = "unsupported" | "denied" | "loading" | "subscribed" | "unsubscribed";

export function usePushSubscription(enabled: boolean) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const subscriptionRef = useRef<PushSubscription | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    checkAndSubscribe();
  }, [enabled]);

  async function checkAndSubscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Fetch the server's VAPID public key
      const keyRes = await fetch("/api/push/vapid-public-key");
      if (!keyRes.ok) { setStatus("unsupported"); return; }
      const { publicKey } = await keyRes.json();

      // Check if already subscribed
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        subscriptionRef.current = existing;
        setStatus("subscribed");
        // Re-register to keep server in sync
        await saveSubscription(existing);
        return;
      }

      // Request permission if not yet granted
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { setStatus("denied"); return; }
      }

      // Subscribe
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      subscriptionRef.current = sub;
      await saveSubscription(sub);
      setStatus("subscribed");
    } catch (err) {
      console.warn("Push subscription failed:", err);
      setStatus("unsubscribed");
    }
  }

  async function saveSubscription(sub: PushSubscription) {
    const token = getToken();
    if (!token) return;
    const json = sub.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    }).catch(() => {});
  }

  async function unsubscribe() {
    try {
      const sub = subscriptionRef.current;
      if (sub) {
        const token = getToken();
        await fetch("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
        subscriptionRef.current = null;
      }
      setStatus("unsubscribed");
    } catch (_) {}
  }

  async function subscribe() {
    setStatus("loading");
    await checkAndSubscribe();
  }

  return { status, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
