import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, membersTable, cellsTable, seniorCellsTable, pcfsTable, teensTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middlewares/auth";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) throw new Error("SESSION_SECRET environment variable must be set");

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET!, { expiresIn: "7d" });
}

function getRoleString(level: number, subtype: string | null): string {
  switch (level) {
    case 1: return "super_admin";
    case 2: return "finance_admin";
    case 3: return subtype ? `admin_${subtype}` : "admin";
    case 4: return "leader";
    case 5: return "member";
    default: return "member";
  }
}

async function getLeaderCellInfo(memberId: number | null | undefined) {
  if (!memberId) return {
    leadsCellId: null, leadsCellName: null,
    leadsSeniorCellId: null, leadsSeniorCellName: null,
    leadsPcfId: null, leadsPcfName: null,
  };
  const [leadsCell, leadsSC, leadsPCF] = await Promise.all([
    db.select({ id: cellsTable.id, name: cellsTable.name })
      .from(cellsTable)
      .where(and(eq(cellsTable.leaderId, memberId), eq(cellsTable.isArchived, false)))
      .limit(1),
    db.select({ id: seniorCellsTable.id, name: seniorCellsTable.name })
      .from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.leaderId, memberId), eq(seniorCellsTable.isArchived, false)))
      .limit(1),
    db.select({ id: pcfsTable.id, name: pcfsTable.name })
      .from(pcfsTable)
      .where(and(eq(pcfsTable.leaderId, memberId), eq(pcfsTable.isArchived, false)))
      .limit(1),
  ]);
  return {
    leadsCellId: leadsCell.length ? leadsCell[0].id : null,
    leadsCellName: leadsCell.length ? leadsCell[0].name : null,
    leadsSeniorCellId: leadsSC.length ? leadsSC[0].id : null,
    leadsSeniorCellName: leadsSC.length ? leadsSC[0].name : null,
    leadsPcfId: leadsPCF.length ? leadsPCF[0].id : null,
    leadsPcfName: leadsPCF.length ? leadsPCF[0].name : null,
  };
}

router.post("/login", async (req, res) => {
  const { username, password, loginType } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  // Teen PIN login: look up teen by membershipId, compare PIN
  if (loginType === "teen_pin") {
    const teen = await db.select().from(teensTable)
      .where(and(eq(teensTable.membershipId, username), eq(teensTable.isArchived, false))).limit(1);
    if (!teen.length || teen[0].pin !== password) {
      return res.status(401).json({ error: "Invalid membership ID or PIN" });
    }
    const t = teen[0];
    const token = generateToken(-t.id);
    return res.json({
      token,
      user: {
        id: -t.id,
        username: t.membershipId ?? "",
        role: "member",
        roleLevel: 5,
        roleSubtype: "teen",
        memberId: null,
        teenId: t.id,
        memberName: `${t.firstName} ${t.lastName}`,
        leadsCellId: null, leadsCellName: null,
        leadsSeniorCellId: null, leadsSeniorCellName: null,
        leadsPcfId: null, leadsPcfName: null,
      },
    });
  }

  // Member PIN login: look up by membershipId in members first, then fall through to teens
  if (loginType === "member_pin") {
    const member = await db.select().from(membersTable)
      .where(and(eq(membersTable.membershipId, username), eq(membersTable.isArchived, false))).limit(1);

    if (member.length && member[0].pin === password) {
      // Found in members table — proceed as member
      let memberUser = await db.select().from(usersTable)
        .where(and(eq(usersTable.memberId, member[0].id), gte(usersTable.roleLevel, 4))).limit(1);
      if (!memberUser.length) {
        const newUser = await db.insert(usersTable).values({
          username: member[0].membershipId.toLowerCase(),
          passwordHash: hashPassword(member[0].pin ?? ""),
          roleLevel: 5,
          roleSubtype: null,
          memberId: member[0].id,
          isActive: true,
        }).returning();
        memberUser = newUser;
      }
      const u = memberUser[0];
      const token = generateToken(u.id);
      const cellInfo = await getLeaderCellInfo(u.memberId);
      return res.json({
        token,
        user: {
          id: u.id, username: u.username,
          role: getRoleString(u.roleLevel, u.roleSubtype),
          roleLevel: u.roleLevel, memberId: u.memberId,
          memberName: `${member[0].firstName} ${member[0].lastName}`,
          ...cellInfo,
        }
      });
    }

    // Not found in members — try teens table
    const teen = await db.select().from(teensTable)
      .where(and(eq(teensTable.membershipId, username), eq(teensTable.isArchived, false))).limit(1);
    if (teen.length && teen[0].pin === password) {
      const t = teen[0];
      const token = generateToken(-t.id);
      return res.json({
        token,
        user: {
          id: -t.id,
          username: t.membershipId ?? "",
          role: "member",
          roleLevel: 5,
          roleSubtype: "teen",
          memberId: null,
          teenId: t.id,
          memberName: `${t.firstName} ${t.lastName}`,
          leadsCellId: null, leadsCellName: null,
          leadsSeniorCellId: null, leadsSeniorCellName: null,
          leadsPcfId: null, leadsPcfName: null,
        },
      });
    }

    return res.status(401).json({ error: "Invalid membership ID or PIN" });
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (!users.length) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const u = users[0];
  if (!u.isActive) return res.status(401).json({ error: "Account is deactivated" });
  const hash = hashPassword(password);
  if (u.passwordHash !== hash) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = generateToken(u.id);

  let memberName: string | null = null;
  if (u.memberId) {
    const member = await db.select({ firstName: membersTable.firstName, lastName: membersTable.lastName })
      .from(membersTable).where(eq(membersTable.id, u.memberId)).limit(1);
    if (member.length) memberName = `${member[0].firstName} ${member[0].lastName}`;
  }

  const cellInfo2 = await getLeaderCellInfo(u.memberId);

  res.json({
    token,
    user: {
      id: u.id, username: u.username,
      role: getRoleString(u.roleLevel, u.roleSubtype),
      roleLevel: u.roleLevel, roleSubtype: u.roleSubtype ?? null,
      memberId: u.memberId,
      memberName,
      ...cellInfo2,
    }
  });
});

router.post("/logout", (req, res) => {
  res.json({ success: true });
});

router.get("/me", authenticateToken, async (req, res) => {
  const user = (req as any).user;

  // Teen user path
  if (user.teenId) {
    const teen = await db.select().from(teensTable).where(eq(teensTable.id, user.teenId)).limit(1);
    if (!teen.length) return res.status(401).json({ error: "Teen not found" });
    const t = teen[0];
    return res.json({
      id: user.id,
      username: user.username,
      role: "member",
      roleLevel: 5,
      roleSubtype: "teen",
      memberId: null,
      teenId: t.id,
      memberName: `${t.firstName} ${t.lastName}`,
      leadsCellId: null, leadsCellName: null,
      leadsSeniorCellId: null, leadsSeniorCellName: null,
      leadsPcfId: null, leadsPcfName: null,
    });
  }

  let memberName: string | null = null;
  let dateOfBirth: string | null = null;
  if (user.memberId) {
    const member = await db.select({ firstName: membersTable.firstName, lastName: membersTable.lastName, dateOfBirth: membersTable.dateOfBirth })
      .from(membersTable).where(eq(membersTable.id, user.memberId)).limit(1);
    if (member.length) {
      memberName = `${member[0].firstName} ${member[0].lastName}`;
      dateOfBirth = member[0].dateOfBirth ?? null;
    }
  }
  const meInfo = await getLeaderCellInfo(user.memberId);
  res.json({
    id: user.id, username: user.username,
    role: getRoleString(user.roleLevel, user.roleSubtype),
    roleLevel: user.roleLevel, memberId: user.memberId,
    memberName, dateOfBirth,
    roleSubtype: user.roleSubtype,
    ...meInfo,
  });
});

router.post("/change-pin", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { currentPin, newPin } = req.body;
  if (!newPin || String(newPin).length < 3 || String(newPin).length > 6) {
    return res.status(400).json({ error: "New PIN must be 3–6 digits" });
  }

  // Teen PIN change
  if (user.teenId) {
    const teen = await db.select().from(teensTable).where(eq(teensTable.id, user.teenId)).limit(1);
    if (!teen.length) return res.status(404).json({ error: "Teen not found" });
    if (teen[0].pin !== currentPin) return res.status(401).json({ error: "Current PIN is incorrect" });
    await db.update(teensTable).set({ pin: newPin }).where(eq(teensTable.id, user.teenId));
    return res.json({ success: true });
  }

  // Member PIN change
  if (!user.memberId) return res.status(403).json({ error: "Not a member" });
  const member = await db.select().from(membersTable).where(eq(membersTable.id, user.memberId)).limit(1);
  if (!member.length) return res.status(404).json({ error: "Member not found" });
  if (member[0].pin !== currentPin) return res.status(401).json({ error: "Current PIN is incorrect" });
  await db.update(membersTable).set({ pin: newPin }).where(eq(membersTable.id, user.memberId));
  res.json({ success: true });
});

export default router;
