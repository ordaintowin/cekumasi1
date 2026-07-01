import { Router } from "express";
import { db, announcementsTable, announcementReadsTable } from "@workspace/db";
import { eq, and, or, isNull, gte, desc, asc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middlewares/auth";
import { sendPushToAll } from "../lib/push";

const router = Router();
router.use(authenticateToken);

async function getVisibleRows(memberId: number | null) {
  const now = new Date();
  return db
    .select()
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.isActive, true),
        or(
          isNull(announcementsTable.targetMemberId),
          memberId !== null
            ? eq(announcementsTable.targetMemberId, memberId)
            : isNull(announcementsTable.targetMemberId)
        ),
        or(
          isNull(announcementsTable.expiresAt),
          gte(announcementsTable.expiresAt, now)
        )
      )
    )
    .orderBy(desc(announcementsTable.createdAt))
    .limit(50);
}

router.get("/", async (req, res) => {
  const user = (req as any).user;
  const memberId: number | null = user.memberId ?? null;

  const rows = await getVisibleRows(memberId);

  if (!memberId) return res.json(rows.map(r => ({ ...r, isRead: false })));

  const readRows = await db
    .select({ announcementId: announcementReadsTable.announcementId })
    .from(announcementReadsTable)
    .where(eq(announcementReadsTable.memberId, memberId));
  const readIds = new Set(readRows.map(r => r.announcementId));

  res.json(rows.map(r => ({ ...r, isRead: readIds.has(r.id) })));
});

router.post("/read-all", async (req, res) => {
  const user = (req as any).user;
  const memberId: number | null = user.memberId ?? null;
  if (!memberId) return res.json({ ok: true });

  const rows = await getVisibleRows(memberId);
  for (const { id } of rows) {
    await db
      .insert(announcementReadsTable)
      .values({ announcementId: id, memberId })
      .onConflictDoNothing();
  }
  res.json({ ok: true, count: rows.length });
});

router.post("/:id/read", async (req, res) => {
  const user = (req as any).user;
  const memberId: number | null = user.memberId ?? null;
  if (!memberId) return res.json({ ok: true });
  const announcementId = parseInt(req.params.id);
  await db
    .insert(announcementReadsTable)
    .values({ announcementId, memberId })
    .onConflictDoNothing();
  res.json({ ok: true });
});

const MAX_ACTIVE_ANNOUNCEMENTS = 5;

router.post("/", requireRole(1), async (req, res) => {
  const user = (req as any).user;
  const { title, message, emoji, expiresInHours, targetMemberId } = req.body;
  if (!title || !message) return res.status(400).json({ error: "title and message required" });

  let expiresAt: Date | null = null;
  if (expiresInHours && Number(expiresInHours) > 0) {
    expiresAt = new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000);
  }

  const parsedTargetMemberId = targetMemberId ? parseInt(String(targetMemberId)) : null;

  const [created] = await db
    .insert(announcementsTable)
    .values({
      title,
      message,
      emoji: emoji || "📢",
      type: parsedTargetMemberId ? "greeting" : "general",
      targetMemberId: parsedTargetMemberId,
      createdBy: user.id,
      expiresAt,
      isActive: true,
    })
    .returning();

  // Auto-prune: keep only the MAX_ACTIVE_ANNOUNCEMENTS most recent global announcements
  if (!parsedTargetMemberId) {
    const activeGlobal = await db
      .select({ id: announcementsTable.id })
      .from(announcementsTable)
      .where(
        and(
          eq(announcementsTable.isActive, true),
          isNull(announcementsTable.targetMemberId)
        )
      )
      .orderBy(desc(announcementsTable.createdAt));

    if (activeGlobal.length > MAX_ACTIVE_ANNOUNCEMENTS) {
      const toDeactivate = activeGlobal.slice(MAX_ACTIVE_ANNOUNCEMENTS).map(r => r.id);
      for (const id of toDeactivate) {
        await db
          .update(announcementsTable)
          .set({ isActive: false })
          .where(eq(announcementsTable.id, id));
      }
    }
  }

  res.status(201).json(created);

  // Fire-and-forget Web Push to all subscribers
  sendPushToAll({
    title: `${emoji || "📢"} ${title}`,
    body: message,
    url: "/my-notifications",
    tag: `announcement-${created.id}`,
  }).catch(() => {});
});

router.delete("/:id", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  await db
    .update(announcementsTable)
    .set({ isActive: false })
    .where(eq(announcementsTable.id, id));
  res.json({ success: true });
});

export default router;
