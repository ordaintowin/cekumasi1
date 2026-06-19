import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, membersTable, activityLogTable } from "@workspace/db";
import { eq, and, ne, desc, ilike, or } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();
router.use(authenticateToken);

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

router.get("/users", requireRole(1), async (req, res) => {
  const users = await db.select().from(usersTable).where(ne(usersTable.roleLevel, 5));
  const enriched = await Promise.all(users.map(async (u) => {
    let memberName = "";
    if (u.memberId) {
      const m = await db.select().from(membersTable).where(eq(membersTable.id, u.memberId)).limit(1);
      if (m.length) memberName = `${m[0].firstName} ${m[0].lastName}`;
    }
    return { id: u.id, username: u.username, roleLevel: u.roleLevel, roleSubtype: u.roleSubtype, memberId: u.memberId || 0, memberName, isActive: u.isActive };
  }));
  res.json(enriched);
});

router.post("/users", requireRole(1), async (req, res) => {
  const { username, password, roleLevel, roleSubtype, memberId } = req.body;
  if (!username || !password || !roleLevel || !memberId) return res.status(400).json({ error: "All fields required" });
  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing.length) return res.status(409).json({ error: "Username already exists" });
  const created = await db.insert(usersTable).values({ username, passwordHash: hashPassword(password), roleLevel, roleSubtype, memberId }).returning();
  const m = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  res.status(201).json({ id: created[0].id, username: created[0].username, roleLevel: created[0].roleLevel, roleSubtype: created[0].roleSubtype, memberId, memberName: m.length ? `${m[0].firstName} ${m[0].lastName}` : "" });
});

router.patch("/users/:id", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  const { password, roleLevel, roleSubtype, isActive } = req.body;
  const update: any = {};
  if (password) update.passwordHash = hashPassword(password);
  if (roleLevel !== undefined) update.roleLevel = roleLevel;
  if (roleSubtype !== undefined) update.roleSubtype = roleSubtype;
  if (isActive !== undefined) update.isActive = isActive;
  const updated = await db.update(usersTable).set(update).where(eq(usersTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "User not found" });
  res.json({ id: updated[0].id, username: updated[0].username, roleLevel: updated[0].roleLevel, roleSubtype: updated[0].roleSubtype, memberId: updated[0].memberId || 0, memberName: "" });
});

router.delete("/users/:id", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

router.get("/activity-log", requireRole(1), async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "100")), 500);
  const offset = parseInt(String(req.query.offset || "0"));
  const search = String(req.query.search || "").trim();

  let query = db.select().from(activityLogTable).$dynamic();
  if (search) {
    query = query.where(
      or(
        ilike(activityLogTable.description, `%${search}%`),
        ilike(activityLogTable.type, `%${search}%`),
        ilike(activityLogTable.memberName, `%${search}%`)
      )
    ) as typeof query;
  }
  const logs = await query.orderBy(desc(activityLogTable.createdAt)).limit(limit).offset(offset);
  res.json(logs);
});

router.post("/activity-log", requireRole(1), async (req, res) => {
  const { type, description, memberId, memberName } = req.body;
  if (!type || !description) return res.status(400).json({ error: "type and description required" });
  const created = await db.insert(activityLogTable).values({ type, description, memberId: memberId ?? null, memberName: memberName ?? null }).returning();
  res.status(201).json(created[0]);
});

router.delete("/activity-log/:id", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(activityLogTable).where(eq(activityLogTable.id, id));
  res.json({ success: true });
});

export default router;
