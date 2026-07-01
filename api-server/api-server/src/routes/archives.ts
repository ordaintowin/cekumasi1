import { Router } from "express";
import { db } from "@workspace/db";
import {
  membersTable, firstTimersTable, usersTable,
  familiesTable, familyChildrenTable,
  leadershipRolesTable, departmentMembersTable, departmentsTable,
  attendanceRecordsTable, givingsTable, activityLogTable,
} from "@workspace/db";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();
router.use(authenticateToken);

router.get("/members", async (req, res) => {
  const { search, page = "1", limit = "25" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  let conditions: any[] = [eq(membersTable.isArchived, true)];
  if (search) conditions.push(or(ilike(membersTable.firstName, `%${search}%`), ilike(membersTable.lastName, `%${search}%`)));

  const members = await db.select().from(membersTable).where(and(...conditions)).limit(limitNum).offset(offset);
  const total = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(...conditions));

  const enriched = await Promise.all(members.map(async (m) => {
    let deletedBy = "System";
    if (m.archivedBy) {
      const u = await db.select().from(usersTable).where(eq(usersTable.id, m.archivedBy)).limit(1);
      if (u.length) deletedBy = u[0].username;
    }
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      phone1: m.phone1,
      memberType: m.memberType,
      reason: m.archiveReason || "",
      deletedAt: m.archivedAt?.toISOString() || "",
      deletedBy,
    };
  }));

  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

router.post("/members/:id/restore", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });
  await db.update(membersTable).set({ isArchived: false, archiveReason: null, archivedAt: null, archivedBy: null }).where(eq(membersTable.id, id));
  res.json({ success: true });
});

// ── Permanent delete: wipes member and all related records from DB ───────────
router.delete("/members/:id", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);

  // Verify member exists and is archived before permanent deletion
  const member = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member.length) return res.status(404).json({ error: "Member not found" });
  if (!member[0].isArchived) return res.status(400).json({ error: "Only archived members can be permanently deleted" });

  // 1. Dissolve any family this member is an adult in, clear partner's spouseId
  // Direct cleanup just in case
  const famHead = await db.select().from(familiesTable).where(eq(familiesTable.headId, id)).limit(1);
  const famSpouse = await db.select().from(familiesTable).where(eq(familiesTable.spouseId, id)).limit(1);
  for (const fam of [...famHead, ...famSpouse]) {
    const otherId = fam.headId === id ? fam.spouseId : fam.headId;
    if (otherId) await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, otherId));
    await db.delete(familyChildrenTable).where(eq(familyChildrenTable.familyId, fam.id));
    await db.delete(familiesTable).where(eq(familiesTable.id, fam.id));
  }
  // Remove from family_children rows (as a child/member)
  await db.delete(familyChildrenTable)
    .where(and(eq(familyChildrenTable.memberId, id), eq(familyChildrenTable.type, "member")));

  // 2. Clear headId on any departments this member leads
  await db.update(departmentsTable).set({ headId: null }).where(eq(departmentsTable.headId, id));
  // 3. Remove department memberships
  await db.delete(departmentMembersTable).where(eq(departmentMembersTable.memberId, id));
  // 4. Remove leadership roles
  await db.delete(leadershipRolesTable).where(eq(leadershipRolesTable.memberId, id));
  // 5. Attendance records and givings are intentionally preserved:
  //    a deleted member still attended those services and gave those offerings.
  //    All aggregate counts (service totals, financial totals) remain accurate.
  // 6. Remove activity log entries
  await db.delete(activityLogTable).where(eq(activityLogTable.memberId, id));
  // 7. Remove user account (if any)
  await db.delete(usersTable).where(eq(usersTable.memberId, id));
  // 8. Finally delete the member record itself
  await db.delete(membersTable).where(eq(membersTable.id, id));

  res.json({ success: true });
});

router.get("/first-timers", async (req, res) => {
  const { page = "1", limit = "25" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  const fts = await db.select().from(firstTimersTable).where(eq(firstTimersTable.isArchived, true)).limit(limitNum).offset(offset);
  const total = await db.select({ count: sql<number>`count(*)` }).from(firstTimersTable).where(eq(firstTimersTable.isArchived, true));

  const enriched = await Promise.all(fts.map(async (ft) => {
    let deletedBy = "System";
    if (ft.archivedBy) {
      const u = await db.select().from(usersTable).where(eq(usersTable.id, ft.archivedBy)).limit(1);
      if (u.length) deletedBy = u[0].username;
    }
    return {
      id: ft.id,
      firstName: ft.firstName,
      lastName: ft.lastName,
      reason: ft.archiveReason || "",
      deletedAt: ft.archivedAt?.toISOString() || "",
      deletedBy,
    };
  }));

  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

router.post("/first-timers/:id/restore", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });
  await db.update(firstTimersTable).set({ isArchived: false, archiveReason: null, archivedAt: null, archivedBy: null }).where(eq(firstTimersTable.id, id));
  res.json({ success: true });
});

export default router;
