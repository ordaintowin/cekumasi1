import { Router } from "express";
import { db, prayerRequestsTable, usersTable, membersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middlewares/auth";

const router = Router();
router.use(authenticateToken);

// Submit a prayer request (any logged-in user)
router.post("/", async (req, res) => {
  const user = (req as any).user;
  const { request } = req.body;
  if (!request?.trim()) return res.status(400).json({ error: "request is required" });

  let memberName: string | null = null;
  if (user.memberId) {
    const [m] = await db.select({ firstName: membersTable.firstName, lastName: membersTable.lastName })
      .from(membersTable).where(eq(membersTable.id, user.memberId));
    if (m) memberName = `${m.firstName} ${m.lastName}`;
  }
  if (!memberName) memberName = user.username ?? null;

  const [created] = await db.insert(prayerRequestsTable).values({
    memberId: user.memberId ?? null,
    memberName,
    request: request.trim(),
    status: "pending",
  }).returning();

  res.status(201).json(created);
});

// Get all prayer requests — admin only
router.get("/", requireRole(1), async (req, res) => {
  const rows = await db.select().from(prayerRequestsTable)
    .orderBy(desc(prayerRequestsTable.createdAt))
    .limit(100);
  res.json(rows);
});

// Mark as prayed — admin only
router.patch("/:id/prayed", requireRole(1), async (req, res) => {
  const user = (req as any).user;
  const id = parseInt(req.params.id);
  const { note } = req.body;
  await db.update(prayerRequestsTable)
    .set({ status: "prayed", prayedNote: note ?? null, prayedAt: new Date(), prayedBy: user.id })
    .where(eq(prayerRequestsTable.id, id));
  res.json({ success: true });
});

// Delete — admin only
router.delete("/:id", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  res.json({ success: true });
});

export default router;
