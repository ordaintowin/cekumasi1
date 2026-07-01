import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject    = process.env.VAPID_SUBJECT ?? "mailto:admin@cekumasi1.org";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    logger.warn("Web Push not configured — VAPID keys missing");
    return;
  }

  const subs = await db.select().from(pushSubscriptionsTable);
  if (!subs.length) return;

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/my-notifications",
    tag: payload.tag ?? "ce-kumasi1",
    icon: payload.icon ?? "/icon-192.png",
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadStr,
      )
    )
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sub = subs[i];
    if (r.status === "rejected") {
      logger.warn({ endpoint: sub.endpoint, err: String(r.reason) }, "Push send failed");
      const reason: any = r.reason;
      if (reason?.statusCode === 404 || reason?.statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
      }
    } else if (r.status === "fulfilled") {
      const code = (r.value as any)?.statusCode;
      if (code === 404 || code === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
      }
    }
  }
}
