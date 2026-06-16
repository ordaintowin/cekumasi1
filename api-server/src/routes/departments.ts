import { Router } from "express";
import { db } from "@workspace/db";
import { departmentsTable, departmentMembersTable, membersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";

const router = Router();
router.use(authenticateToken);

function fmt(m: { title?: string | null; firstName: string; lastName: string }): string {
  return m.title ? `${m.title} ${m.firstName} ${m.lastName}` : `${m.firstName} ${m.lastName}`;
}

router.get("/", async (req, res) => {
  const currentMemberId: number | null = (req as any).user?.memberId ?? null;
  const depts = await db.select().from(departmentsTable).where(eq(departmentsTable.isArchived, false)).orderBy(departmentsTable.name);
  const enriched = await Promise.all(depts.map(async (d) => {
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(departmentMembersTable).where(eq(departmentMembersTable.departmentId, d.id));
    let headName = null;
    if (d.headId) {
      const h = await db.select().from(membersTable).where(eq(membersTable.id, d.headId)).limit(1);
      if (h.length) headName = fmt(h[0]);
    }
    let currentUserIsMember = false;
    if (currentMemberId) {
      const membership = await db.select().from(departmentMembersTable)
        .where(and(eq(departmentMembersTable.departmentId, d.id), eq(departmentMembersTable.memberId, currentMemberId)))
        .limit(1);
      currentUserIsMember = membership.length > 0;
    }
    return { ...d, memberCount: Number(cnt[0].count), headName, currentUserIsMember };
  }));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  const { name, description, headId } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  const created = await db.insert(departmentsTable).values({ name, description, headId: headId || null }).returning();
  res.status(201).json({ ...created[0], memberCount: 0, headName: null });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const dept = await db.select().from(departmentsTable).where(eq(departmentsTable.id, id)).limit(1);
  if (!dept.length) return res.status(404).json({ error: "Department not found" });
  const deptMembers = await db.select().from(departmentMembersTable).where(eq(departmentMembersTable.departmentId, id));
  const enrichedMembers = await Promise.all(deptMembers.map(async (dm) => {
    const m = await db.select().from(membersTable).where(eq(membersTable.id, dm.memberId)).limit(1);
    return {
      memberId: dm.memberId,
      memberName: m.length ? fmt(m[0]) : "Unknown",
      phone1: m.length ? m[0].phone1 : "",
      subUnit: dm.subUnit,
      isHead: dm.isHead,
    };
  }));
  // Head first
  const sorted = [...enrichedMembers.filter(m => m.isHead), ...enrichedMembers.filter(m => !m.isHead)];
  let headName = null;
  if (dept[0].headId) {
    const h = await db.select().from(membersTable).where(eq(membersTable.id, dept[0].headId)).limit(1);
      if (h.length) headName = fmt(h[0]);
  }
  res.json({ ...dept[0], memberCount: deptMembers.length, headName, members: sorted });
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, headId } = req.body;
  const update: any = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (headId !== undefined) update.headId = headId || null;
  const updated = await db.update(departmentsTable).set(update).where(eq(departmentsTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Department not found" });
  const cnt = await db.select({ count: sql<number>`count(*)` }).from(departmentMembersTable).where(eq(departmentMembersTable.departmentId, id));
  res.json({ ...updated[0], memberCount: Number(cnt[0].count) });
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });
  await db.update(departmentsTable).set({ isArchived: true, archiveReason: reason }).where(eq(departmentsTable.id, id));
  res.json({ success: true });
});

router.post("/:id/members", async (req, res) => {
  const departmentId = parseInt(req.params.id);
  const { memberId, subUnit, isHead } = req.body;
  if (!memberId) return res.status(400).json({ error: "Member ID required" });
  // Check not already in another department
  const existing = await db.select().from(departmentMembersTable).where(eq(departmentMembersTable.memberId, memberId)).limit(1);
  if (existing.length && existing[0].departmentId !== departmentId) {
    return res.status(409).json({ error: "Member is already in another service department" });
  }
  await db.insert(departmentMembersTable).values({ departmentId, memberId, subUnit, isHead: isHead || false }).onConflictDoNothing();
  res.status(201).json({ success: true });
});

router.patch("/:id/members/:memberId", async (req, res) => {
  const departmentId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);
  const { subUnit, isHead } = req.body;
  const update: any = {};
  if (subUnit !== undefined) update.subUnit = subUnit;
  if (isHead !== undefined) update.isHead = isHead;
  await db.update(departmentMembersTable).set(update)
    .where(and(eq(departmentMembersTable.departmentId, departmentId), eq(departmentMembersTable.memberId, memberId)));
  res.json({ success: true });
});

router.delete("/:id/members/:memberId", async (req, res) => {
  const departmentId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);
  await db.delete(departmentMembersTable).where(and(eq(departmentMembersTable.departmentId, departmentId), eq(departmentMembersTable.memberId, memberId)));
  res.json({ success: true });
});

export default router;
