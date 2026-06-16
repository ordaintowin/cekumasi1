import { Router } from "express";
import { db } from "@workspace/db";
import { cellsTable, seniorCellsTable, pcfsTable, membersTable, leadershipRolesTable, usersTable } from "@workspace/db";
import { eq, and, ilike, isNull, ne, sql, inArray, or } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();
router.use(authenticateToken);

function fmt(m: { title?: string | null; firstName: string; lastName: string }): string {
  return m.title ? `${m.title} ${m.firstName} ${m.lastName}` : `${m.firstName} ${m.lastName}`;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

async function ensureLeaderAccount(memberId: number) {
  const member = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  if (!member.length) return;
  const m = member[0];
  const existing = await db.select().from(usersTable).where(eq(usersTable.memberId, memberId)).limit(1);
  if (existing.length) {
    if (existing[0].roleLevel === 5 || existing[0].roleLevel === 4) {
      await db.update(usersTable).set({ roleLevel: 4, isActive: true }).where(eq(usersTable.memberId, memberId));
    }
  } else {
    const pin = m.pin ?? "1234";
    await db.insert(usersTable).values({
      username: m.membershipId,
      passwordHash: hashPassword(pin),
      roleLevel: 4,
      memberId,
      isActive: true,
    });
  }
}

async function downgradeLeaderAccount(memberId: number) {
  const stillLeadsCell = await db.select().from(cellsTable).where(and(eq(cellsTable.leaderId, memberId), eq(cellsTable.isArchived, false))).limit(1);
  const stillLeadsSC = await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.leaderId, memberId), eq(seniorCellsTable.isArchived, false))).limit(1);
  const stillLeadsPCF = await db.select().from(pcfsTable).where(and(eq(pcfsTable.leaderId, memberId), eq(pcfsTable.isArchived, false))).limit(1);
  if (stillLeadsCell.length || stillLeadsSC.length || stillLeadsPCF.length) return;
  const existing = await db.select().from(usersTable).where(eq(usersTable.memberId, memberId)).limit(1);
  if (existing.length && existing[0].roleLevel === 4) {
    await db.update(usersTable).set({ roleLevel: 5 }).where(eq(usersTable.memberId, memberId));
  }
}

async function getCellWithDetails(cellId: number) {
  const cell = await db.select().from(cellsTable).where(and(eq(cellsTable.id, cellId), eq(cellsTable.isArchived, false))).limit(1);
  if (!cell.length) return null;
  const c = cell[0];
  const memberCount = await db.select({ count: sql<number>`count(*)` }).from(membersTable)
    .where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
  let leaderName = null;
  if (c.leaderId) {
    const leader = await db.select().from(membersTable).where(eq(membersTable.id, c.leaderId)).limit(1);
    if (leader.length) leaderName = fmt(leader[0]);
  }
  return { ...c, memberCount: Number(memberCount[0].count), hasLeader: !!c.leaderId, leaderName };
}

// CELLS
router.get("/cells", async (req, res) => {
  const { search, seniorCellId, standalone } = req.query as any;
  let conditions: any[] = [eq(cellsTable.isArchived, false)];
  if (search) conditions.push(ilike(cellsTable.name, `%${search}%`));
  if (seniorCellId) conditions.push(eq(cellsTable.seniorCellId, parseInt(seniorCellId)));
  if (standalone === "true") conditions.push(isNull(cellsTable.seniorCellId));

  const cells = await db.select().from(cellsTable).where(and(...conditions)).orderBy(cellsTable.name);
  const enriched = await Promise.all(cells.map(async (c) => {
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable)
      .where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
    let leaderName = null;
    if (c.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, c.leaderId)).limit(1);
      if (l.length) leaderName = fmt(l[0]);
    }
    let seniorCellName = null;
    if (c.seniorCellId) {
      const sc = await db.select().from(seniorCellsTable).where(eq(seniorCellsTable.id, c.seniorCellId)).limit(1);
      if (sc.length) seniorCellName = sc[0].name;
    }
    return { ...c, memberCount: Number(cnt[0].count), hasLeader: !!c.leaderId, leaderName, seniorCellName };
  }));
  res.json(enriched);
});

router.post("/cells", async (req, res) => {
  const { name, leaderId } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  const existing = await db.select().from(cellsTable).where(and(ilike(cellsTable.name, name.trim()), eq(cellsTable.isArchived, false))).limit(1);
  if (existing.length) return res.status(409).json({ error: "A cell with this name already exists" });
  const created = await db.insert(cellsTable).values({ name: name.trim(), leaderId: leaderId || null }).returning();
  res.status(201).json({ ...created[0], memberCount: 0, hasLeader: !!leaderId, leaderName: null });
});

router.get("/cells/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const cell = await getCellWithDetails(id);
  if (!cell) return res.status(404).json({ error: "Cell not found" });
  const members = await db.select().from(membersTable).where(and(eq(membersTable.cellId, id), eq(membersTable.isArchived, false)));
  const enriched = await Promise.all(members.map(async (m) => {
    const roles = await db.select().from(leadershipRolesTable).where(eq(leadershipRolesTable.memberId, m.id));
    return { ...m, leadershipRoles: roles.map(r => r.role) };
  }));
  res.json({ ...cell, members: enriched });
});

router.patch("/cells/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, leaderId } = req.body;
  if (name) {
    const existing = await db.select().from(cellsTable).where(and(ilike(cellsTable.name, name.trim()), eq(cellsTable.isArchived, false), ne(cellsTable.id, id))).limit(1);
    if (existing.length) return res.status(409).json({ error: "A cell with this name already exists" });
  }
  if (leaderId) {
    const memberExists = await db.select().from(membersTable).where(and(eq(membersTable.id, leaderId), eq(membersTable.isArchived, false))).limit(1);
    if (!memberExists.length) return res.status(400).json({ error: "Member not found" });
    // Rule 6: Cell Leader must be a member of that cell
    const isMemberOfCell = await db.select().from(membersTable)
      .where(and(eq(membersTable.id, leaderId), eq(membersTable.cellId, id), eq(membersTable.isArchived, false))).limit(1);
    if (!isMemberOfCell.length) return res.status(400).json({ error: "The Cell Leader must be a member of this cell" });
    const alreadyLeads = await db.select().from(cellsTable).where(and(eq(cellsTable.leaderId, leaderId), ne(cellsTable.id, id), eq(cellsTable.isArchived, false))).limit(1);
    if (alreadyLeads.length) return res.status(400).json({ error: "This member already leads another cell" });
  }
  const current = await db.select().from(cellsTable).where(eq(cellsTable.id, id)).limit(1);
  const oldLeaderId = current.length ? current[0].leaderId : null;
  const update: any = {};
  if (name !== undefined) update.name = name.trim();
  if (leaderId !== undefined) update.leaderId = leaderId || null;
  const updated = await db.update(cellsTable).set(update).where(eq(cellsTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Cell not found" });
  const newLeaderId = leaderId !== undefined ? (leaderId || null) : oldLeaderId;
  if (oldLeaderId && oldLeaderId !== newLeaderId) {
    await db.update(seniorCellsTable).set({ leaderId: null }).where(and(eq(seniorCellsTable.leaderId, oldLeaderId), eq(seniorCellsTable.isArchived, false)));
    await db.update(pcfsTable).set({ leaderId: null }).where(and(eq(pcfsTable.leaderId, oldLeaderId), eq(pcfsTable.isArchived, false)));
    await downgradeLeaderAccount(oldLeaderId);
  }
  if (newLeaderId && newLeaderId !== oldLeaderId) {
    await ensureLeaderAccount(newLeaderId);
  }
  const c = updated[0];
  const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.cellId, id), eq(membersTable.isArchived, false)));
  let leaderName = null;
  if (c.leaderId) {
    const l = await db.select().from(membersTable).where(eq(membersTable.id, c.leaderId)).limit(1);
    if (l.length) leaderName = fmt(l[0]);
  }
  res.json({ ...c, memberCount: Number(cnt[0].count), hasLeader: !!c.leaderId, leaderName });
});

router.delete("/cells/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });
  const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.cellId, id), eq(membersTable.isArchived, false)));
  if (Number(cnt[0].count) > 0) {
    return res.status(409).json({ error: `This cell has ${cnt[0].count} member(s). Please reassign all members to another fellowship before deleting.` });
  }

  const [cell] = await db.select().from(cellsTable).where(eq(cellsTable.id, id)).limit(1);
  if (!cell) return res.status(404).json({ error: "Cell not found" });

  await db.update(cellsTable).set({ isArchived: true }).where(eq(cellsTable.id, id));

  let autoDeletedSc: string | null = null;
  let autoDeletedPcf: string | null = null;

  if (cell.seniorCellId) {
    const remainingCells = await db.select().from(cellsTable)
      .where(and(eq(cellsTable.seniorCellId, cell.seniorCellId), eq(cellsTable.isArchived, false)));
    if (remainingCells.length === 1) {
      const [sc] = await db.select().from(seniorCellsTable).where(eq(seniorCellsTable.id, cell.seniorCellId)).limit(1);
      autoDeletedSc = sc?.name ?? null;
      const pcfId = sc?.pcfId ?? null;
      await db.update(cellsTable).set({ seniorCellId: null }).where(eq(cellsTable.id, remainingCells[0].id));
      await db.update(seniorCellsTable).set({ isArchived: true }).where(eq(seniorCellsTable.id, cell.seniorCellId));

      if (pcfId) {
        const remainingScs = await db.select().from(seniorCellsTable)
          .where(and(eq(seniorCellsTable.pcfId, pcfId), eq(seniorCellsTable.isArchived, false)));
        if (remainingScs.length === 1) {
          const [pcf] = await db.select().from(pcfsTable).where(eq(pcfsTable.id, pcfId)).limit(1);
          autoDeletedPcf = pcf?.name ?? null;
          await db.update(seniorCellsTable).set({ pcfId: null }).where(eq(seniorCellsTable.id, remainingScs[0].id));
          await db.update(pcfsTable).set({ isArchived: true }).where(eq(pcfsTable.id, pcfId));
        }
      }
    }
  }

  res.json({ success: true, autoDeletedSc, autoDeletedPcf });
});

// SENIOR CELLS
router.get("/senior-cells", async (req, res) => {
  const { search, pcfId, standalone } = req.query as any;
  let conditions: any[] = [eq(seniorCellsTable.isArchived, false)];
  if (search) conditions.push(ilike(seniorCellsTable.name, `%${search}%`));
  if (pcfId) conditions.push(eq(seniorCellsTable.pcfId, parseInt(pcfId)));
  if (standalone === "true") conditions.push(isNull(seniorCellsTable.pcfId));

  const scs = await db.select().from(seniorCellsTable).where(and(...conditions)).orderBy(seniorCellsTable.name);
  const enriched = await Promise.all(scs.map(async (sc) => {
    const cells = await db.select().from(cellsTable).where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
    const cellCount = cells.length;
    const memberCounts = await Promise.all(cells.map(async (c) => {
      const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
      return Number(cnt[0].count);
    }));
    const memberCount = memberCounts.reduce((a, b) => a + b, 0);
    let leaderName = null;
    if (sc.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, sc.leaderId)).limit(1);
      if (l.length) leaderName = fmt(l[0]);
    }
    let pcfName = null;
    if (sc.pcfId) {
      const p = await db.select().from(pcfsTable).where(eq(pcfsTable.id, sc.pcfId)).limit(1);
      if (p.length) pcfName = p[0].name;
    }
    return { ...sc, cellCount, memberCount, hasLeader: !!sc.leaderId, leaderName, pcfName };
  }));
  res.json(enriched);
});

router.post("/senior-cells", async (req, res) => {
  const { name, cellIds, leaderId } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  if (!cellIds || !Array.isArray(cellIds) || cellIds.length < 2) return res.status(400).json({ error: "At least 2 cells required" });
  const existing = await db.select().from(seniorCellsTable).where(and(ilike(seniorCellsTable.name, name.trim()), eq(seniorCellsTable.isArchived, false))).limit(1);
  if (existing.length) return res.status(409).json({ error: "A senior cell with this name already exists" });
  const result = await db.transaction(async (tx) => {
    const created = await tx.insert(seniorCellsTable).values({ name: name.trim(), leaderId: leaderId || null }).returning();
    await tx.update(cellsTable).set({ seniorCellId: created[0].id }).where(inArray(cellsTable.id, cellIds.map(Number)));
    return created[0];
  });
  res.status(201).json({ ...result, cellCount: cellIds.length, memberCount: 0, hasLeader: !!leaderId, leaderName: null });
});

router.get("/senior-cells/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const sc = await db.select().from(seniorCellsTable).where(eq(seniorCellsTable.id, id)).limit(1);
  if (!sc.length) return res.status(404).json({ error: "Senior cell not found" });
  const cells = await db.select().from(cellsTable).where(and(eq(cellsTable.seniorCellId, id), eq(cellsTable.isArchived, false)));
  const enrichedCells = await Promise.all(cells.map(async (c) => {
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
    let leaderName = null;
    if (c.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, c.leaderId)).limit(1);
      if (l.length) leaderName = fmt(l[0]);
    }
    const members = await db.select().from(membersTable).where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
    return { ...c, memberCount: Number(cnt[0].count), hasLeader: !!c.leaderId, leaderName, members };
  }));
  const cellCount = cells.length;
  const memberCount = enrichedCells.reduce((a, b) => a + b.memberCount, 0);
  let leaderName = null;
  if (sc[0].leaderId) {
    const l = await db.select().from(membersTable).where(eq(membersTable.id, sc[0].leaderId)).limit(1);
    if (l.length) leaderName = fmt(l[0]);
  }
  res.json({ ...sc[0], cellCount, memberCount, hasLeader: !!sc[0].leaderId, leaderName, cells: enrichedCells });
});

router.patch("/senior-cells/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, leaderId, cellIds } = req.body;
  if (name) {
    const existing = await db.select().from(seniorCellsTable).where(and(ilike(seniorCellsTable.name, name.trim()), eq(seniorCellsTable.isArchived, false), ne(seniorCellsTable.id, id))).limit(1);
    if (existing.length) return res.status(409).json({ error: "A senior cell with this name already exists" });
  }
  if (leaderId) {
    const memberExists = await db.select().from(membersTable).where(and(eq(membersTable.id, leaderId), eq(membersTable.isArchived, false))).limit(1);
    if (!memberExists.length) return res.status(400).json({ error: "Member not found" });
    // Rule 7: Senior Cell Leader must be a Cell Leader of one of this Senior Cell's cells
    const effectiveCellIds = (cellIds && Array.isArray(cellIds) && cellIds.length > 0)
      ? cellIds.map(Number)
      : (await db.select({ id: cellsTable.id }).from(cellsTable).where(and(eq(cellsTable.seniorCellId, id), eq(cellsTable.isArchived, false)))).map((c: any) => c.id);
    const validLeader = effectiveCellIds.length > 0
      ? await db.select().from(cellsTable).where(and(eq(cellsTable.leaderId, leaderId), inArray(cellsTable.id, effectiveCellIds))).limit(1)
      : [];
    if (!validLeader.length) return res.status(400).json({ error: "The Senior Cell Leader must be a Cell Leader of one of this Senior Cell's cells" });
    const alreadyLeads = await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.leaderId, leaderId), ne(seniorCellsTable.id, id), eq(seniorCellsTable.isArchived, false))).limit(1);
    if (alreadyLeads.length) return res.status(400).json({ error: "This member already leads another Senior Cell" });
  }
  const current = await db.select().from(seniorCellsTable).where(eq(seniorCellsTable.id, id)).limit(1);
  const oldLeaderId = current.length ? current[0].leaderId : null;
  const update: any = {};
  if (name !== undefined) update.name = name.trim();
  if (leaderId !== undefined) update.leaderId = leaderId || null;
  const updated = await db.update(seniorCellsTable).set(update).where(eq(seniorCellsTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Senior cell not found" });
  const newLeaderId = leaderId !== undefined ? (leaderId || null) : oldLeaderId;
  if (oldLeaderId && oldLeaderId !== newLeaderId) {
    await db.update(pcfsTable).set({ leaderId: null }).where(and(eq(pcfsTable.leaderId, oldLeaderId), eq(pcfsTable.isArchived, false)));
    await downgradeLeaderAccount(oldLeaderId);
  }
  if (newLeaderId && newLeaderId !== oldLeaderId) {
    await ensureLeaderAccount(newLeaderId);
  }
  if (cellIds && Array.isArray(cellIds) && cellIds.length > 0) {
    await db.update(cellsTable).set({ seniorCellId: null }).where(eq(cellsTable.seniorCellId, id));
    await db.update(cellsTable).set({ seniorCellId: id }).where(inArray(cellsTable.id, cellIds.map(Number)));
  }
  res.json({ ...updated[0], hasLeader: !!updated[0].leaderId });
});

router.delete("/senior-cells/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });
  // Block only if there are members in this SC's cells
  const cells = await db.select({ id: cellsTable.id }).from(cellsTable)
    .where(and(eq(cellsTable.seniorCellId, id), eq(cellsTable.isArchived, false)));
  let totalMembers = 0;
  for (const cell of cells) {
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable)
      .where(and(eq(membersTable.cellId, cell.id), eq(membersTable.isArchived, false)));
    totalMembers += Number(cnt[0].count);
  }
  if (totalMembers > 0) return res.status(409).json({ error: `This senior cell has ${totalMembers} member(s). Reassign all members to another fellowship before deleting.` });

  const [sc] = await db.select().from(seniorCellsTable).where(eq(seniorCellsTable.id, id)).limit(1);
  if (!sc) return res.status(404).json({ error: "Senior cell not found" });
  const pcfId = sc.pcfId;

  // Detach cells so they become standalone (not deleted)
  await db.update(cellsTable).set({ seniorCellId: null }).where(eq(cellsTable.seniorCellId, id));
  await db.update(seniorCellsTable).set({ isArchived: true }).where(eq(seniorCellsTable.id, id));

  let autoDeletedPcf: string | null = null;

  if (pcfId) {
    const remainingScs = await db.select().from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.pcfId, pcfId), eq(seniorCellsTable.isArchived, false)));
    if (remainingScs.length === 1) {
      const [pcf] = await db.select().from(pcfsTable).where(eq(pcfsTable.id, pcfId)).limit(1);
      autoDeletedPcf = pcf?.name ?? null;
      await db.update(seniorCellsTable).set({ pcfId: null }).where(eq(seniorCellsTable.id, remainingScs[0].id));
      await db.update(pcfsTable).set({ isArchived: true }).where(eq(pcfsTable.id, pcfId));
    }
  }

  res.json({ success: true, autoDeletedPcf });
});

// PCFs
router.get("/pcfs", async (req, res) => {
  const { search } = req.query as any;
  let conditions: any[] = [eq(pcfsTable.isArchived, false)];
  if (search) conditions.push(ilike(pcfsTable.name, `%${search}%`));
  const pcfs = await db.select().from(pcfsTable).where(and(...conditions)).orderBy(pcfsTable.name);
  const enriched = await Promise.all(pcfs.map(async (p) => {
    const scs = await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.pcfId, p.id), eq(seniorCellsTable.isArchived, false)));
    const scCount = scs.length;
    let memberCount = 0;
    for (const sc of scs) {
      const cells = await db.select().from(cellsTable).where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
      for (const c of cells) {
        const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
        memberCount += Number(cnt[0].count);
      }
    }
    let leaderName = null;
    if (p.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, p.leaderId)).limit(1);
      if (l.length) leaderName = fmt(l[0]);
    }
    return { ...p, seniorCellCount: scCount, memberCount, hasLeader: !!p.leaderId, leaderName };
  }));
  res.json(enriched);
});

router.post("/pcfs", async (req, res) => {
  const { name, seniorCellIds, leaderId } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  if (!seniorCellIds || !Array.isArray(seniorCellIds) || seniorCellIds.length < 2) return res.status(400).json({ error: "At least 2 senior cells required" });
  const existing = await db.select().from(pcfsTable).where(and(ilike(pcfsTable.name, name.trim()), eq(pcfsTable.isArchived, false))).limit(1);
  if (existing.length) return res.status(409).json({ error: "A PCF with this name already exists" });
  const result = await db.transaction(async (tx) => {
    const created = await tx.insert(pcfsTable).values({ name: name.trim(), leaderId: leaderId || null }).returning();
    await tx.update(seniorCellsTable).set({ pcfId: created[0].id }).where(inArray(seniorCellsTable.id, seniorCellIds.map(Number)));
    return created[0];
  });
  res.status(201).json({ ...result, seniorCellCount: seniorCellIds.length, memberCount: 0, hasLeader: !!leaderId, leaderName: null });
});

router.get("/pcfs/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const pcf = await db.select().from(pcfsTable).where(eq(pcfsTable.id, id)).limit(1);
  if (!pcf.length) return res.status(404).json({ error: "PCF not found" });
  const scs = await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.pcfId, id), eq(seniorCellsTable.isArchived, false)));
  const enrichedSCs = await Promise.all(scs.map(async (sc) => {
    const cells = await db.select().from(cellsTable).where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
    const enrichedCells = await Promise.all(cells.map(async (c) => {
      const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
      let leaderName = null;
      if (c.leaderId) {
        const l = await db.select().from(membersTable).where(eq(membersTable.id, c.leaderId)).limit(1);
        if (l.length) leaderName = fmt(l[0]);
      }
      const members = await db.select().from(membersTable).where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
      return { ...c, memberCount: Number(cnt[0].count), hasLeader: !!c.leaderId, leaderName, members };
    }));
    const cellCount = cells.length;
    const memberCount = enrichedCells.reduce((a, b) => a + b.memberCount, 0);
    let leaderName = null;
    if (sc.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, sc.leaderId)).limit(1);
      if (l.length) leaderName = fmt(l[0]);
    }
    return { ...sc, cellCount, memberCount, hasLeader: !!sc.leaderId, leaderName, cells: enrichedCells };
  }));
  const seniorCellCount = scs.length;
  const memberCount = enrichedSCs.reduce((a, b) => a + b.memberCount, 0);
  let leaderName = null;
  if (pcf[0].leaderId) {
    const l = await db.select().from(membersTable).where(eq(membersTable.id, pcf[0].leaderId)).limit(1);
    if (l.length) leaderName = fmt(l[0]);
  }
  res.json({ ...pcf[0], seniorCellCount, memberCount, hasLeader: !!pcf[0].leaderId, leaderName, seniorCells: enrichedSCs });
});

router.patch("/pcfs/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, leaderId, seniorCellIds } = req.body;
  if (name) {
    const existing = await db.select().from(pcfsTable).where(and(ilike(pcfsTable.name, name.trim()), eq(pcfsTable.isArchived, false), ne(pcfsTable.id, id))).limit(1);
    if (existing.length) return res.status(409).json({ error: "A PCF with this name already exists" });
  }
  if (leaderId) {
    const memberExists = await db.select().from(membersTable).where(and(eq(membersTable.id, leaderId), eq(membersTable.isArchived, false))).limit(1);
    if (!memberExists.length) return res.status(400).json({ error: "Member not found" });
    // Rule 8: PCF Leader must be a Senior Cell Leader of one of this PCF's Senior Cells
    const effectiveSCIds = (seniorCellIds && Array.isArray(seniorCellIds) && seniorCellIds.length > 0)
      ? seniorCellIds.map(Number)
      : (await db.select({ id: seniorCellsTable.id }).from(seniorCellsTable).where(and(eq(seniorCellsTable.pcfId, id), eq(seniorCellsTable.isArchived, false)))).map((sc: any) => sc.id);
    const validLeader = effectiveSCIds.length > 0
      ? await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.leaderId, leaderId), inArray(seniorCellsTable.id, effectiveSCIds))).limit(1)
      : [];
    if (!validLeader.length) return res.status(400).json({ error: "The PCF Leader must be a Senior Cell Leader of one of this PCF's Senior Cells" });
    const alreadyLeads = await db.select().from(pcfsTable).where(and(eq(pcfsTable.leaderId, leaderId), ne(pcfsTable.id, id), eq(pcfsTable.isArchived, false))).limit(1);
    if (alreadyLeads.length) return res.status(400).json({ error: "This member already leads another PCF" });
  }
  const currentPcf = await db.select().from(pcfsTable).where(eq(pcfsTable.id, id)).limit(1);
  const oldLeaderId = currentPcf.length ? currentPcf[0].leaderId : null;
  const update: any = {};
  if (name !== undefined) update.name = name.trim();
  if (leaderId !== undefined) update.leaderId = leaderId || null;
  const updated = await db.update(pcfsTable).set(update).where(eq(pcfsTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "PCF not found" });
  const newLeaderId = leaderId !== undefined ? (leaderId || null) : oldLeaderId;
  if (oldLeaderId && oldLeaderId !== newLeaderId) {
    await downgradeLeaderAccount(oldLeaderId);
  }
  if (newLeaderId && newLeaderId !== oldLeaderId) {
    await ensureLeaderAccount(newLeaderId);
  }
  if (seniorCellIds && Array.isArray(seniorCellIds) && seniorCellIds.length > 0) {
    await db.update(seniorCellsTable).set({ pcfId: null }).where(eq(seniorCellsTable.pcfId, id));
    await db.update(seniorCellsTable).set({ pcfId: id }).where(inArray(seniorCellsTable.id, seniorCellIds.map(Number)));
  }
  res.json({ ...updated[0], hasLeader: !!updated[0].leaderId });
});

router.delete("/pcfs/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });
  // Block only if there are members anywhere under this PCF
  const scs = await db.select({ id: seniorCellsTable.id }).from(seniorCellsTable)
    .where(and(eq(seniorCellsTable.pcfId, id), eq(seniorCellsTable.isArchived, false)));
  let totalMembers = 0;
  for (const sc of scs) {
    const cells = await db.select({ id: cellsTable.id }).from(cellsTable)
      .where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
    for (const cell of cells) {
      const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable)
        .where(and(eq(membersTable.cellId, cell.id), eq(membersTable.isArchived, false)));
      totalMembers += Number(cnt[0].count);
    }
  }
  if (totalMembers > 0) return res.status(409).json({ error: `This PCF has ${totalMembers} member(s). Reassign all members to another fellowship before deleting.` });
  // Detach senior cells so they remain as standalone fellowships (not deleted)
  await db.update(seniorCellsTable).set({ pcfId: null }).where(eq(seniorCellsTable.pcfId, id));
  await db.update(pcfsTable).set({ isArchived: true }).where(eq(pcfsTable.id, id));
  res.json({ success: true });
});

// HIERARCHY
router.get("/fellowships/hierarchy", async (req, res) => {
  const pcfs = await db.select().from(pcfsTable).where(eq(pcfsTable.isArchived, false));
  const standaloneSCs = await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.isArchived, false), isNull(seniorCellsTable.pcfId)));
  const standaloneCells = await db.select().from(cellsTable).where(and(eq(cellsTable.isArchived, false), isNull(cellsTable.seniorCellId)));

  const enrichPcf = async (p: any) => {
    const scs = await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.pcfId, p.id), eq(seniorCellsTable.isArchived, false)));
    const enrichedSCs = await Promise.all(scs.map(enrichSeniorCell));
    const memberCount = enrichedSCs.reduce((a: number, b: any) => a + b.memberCount, 0);
    let leaderName = null; let leaderPhone = null;
    if (p.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, p.leaderId)).limit(1);
      if (l.length) { leaderName = fmt(l[0]); leaderPhone = l[0].phone1 ?? null; }
    }
    return { ...p, seniorCellCount: scs.length, memberCount, hasLeader: !!p.leaderId, leaderName, leaderPhone, seniorCells: enrichedSCs };
  };

  const enrichSeniorCell = async (sc: any) => {
    const cells = await db.select().from(cellsTable).where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
    const enrichedCells = await Promise.all(cells.map(enrichCell));
    const memberCount = enrichedCells.reduce((a: number, b: any) => a + b.memberCount, 0);
    let leaderName = null; let leaderPhone = null;
    if (sc.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, sc.leaderId)).limit(1);
      if (l.length) { leaderName = fmt(l[0]); leaderPhone = l[0].phone1 ?? null; }
    }
    return { ...sc, cellCount: cells.length, memberCount, hasLeader: !!sc.leaderId, leaderName, leaderPhone, cells: enrichedCells };
  };

  const enrichCell = async (c: any) => {
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.cellId, c.id), eq(membersTable.isArchived, false)));
    let leaderName = null; let leaderPhone = null;
    if (c.leaderId) {
      const l = await db.select().from(membersTable).where(eq(membersTable.id, c.leaderId)).limit(1);
      if (l.length) { leaderName = fmt(l[0]); leaderPhone = l[0].phone1 ?? null; }
    }
    return { ...c, memberCount: Number(cnt[0].count), hasLeader: !!c.leaderId, leaderName, leaderPhone, members: [] };
  };

  const enrichedPcfs = await Promise.all(pcfs.map(enrichPcf));
  const enrichedSCs = await Promise.all(standaloneSCs.map(enrichSeniorCell));
  const enrichedCells = await Promise.all(standaloneCells.map(enrichCell));

  res.json({ pcfs: enrichedPcfs, standaloneSeniorCells: enrichedSCs, standaloneCells: enrichedCells });
});

export default router;
