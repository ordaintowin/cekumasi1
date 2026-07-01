import { Router } from "express";
import { db } from "@workspace/db";
import { ministryYearsTable, givingTypesTable, givingsTable, membersTable, teensTable, childrenTable, firstTimersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();
router.use(authenticateToken);

function fmt(m: { title?: string | null; firstName: string; lastName: string }): string {
  return m.title ? `${m.title} ${m.firstName} ${m.lastName}` : `${m.firstName} ${m.lastName}`;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

async function resolvePersonName(g: any): Promise<string> {
  if (g.personName) return g.personName;
  if (g.memberId) {
    const member = await db.select().from(membersTable).where(eq(membersTable.id, g.memberId)).limit(1);
    return member.length ? fmt(member[0]) : "Unknown";
  }
  if (g.teenId) {
    const teen = await db.select().from(teensTable).where(eq(teensTable.id, g.teenId)).limit(1);
    return teen.length ? `${teen[0].firstName} ${teen[0].lastName} (Teen)` : "Unknown Teen";
  }
  if (g.childId) {
    const child = await db.select().from(childrenTable).where(eq(childrenTable.id, g.childId)).limit(1);
    return child.length ? `${child[0].firstName} ${child[0].lastName} (Child)` : "Unknown Child";
  }
  if (g.firstTimerId) {
    const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, g.firstTimerId)).limit(1);
    return ft.length ? `${ft[0].firstName} ${ft[0].lastName} (First Timer)` : "Unknown First Timer";
  }
  return "Unknown";
}

// ─── MINISTRY YEARS ───────────────────────────────────────────────────────────

router.get("/ministry-years", async (req, res) => {
  const { activeOnly } = req.query as any;
  let query = db.select().from(ministryYearsTable).orderBy(ministryYearsTable.startDate);
  const years = await query;
  const filtered = activeOnly === "true" ? years.filter((y: any) => !y.isClosed) : years;
  res.json(filtered);
});

router.post("/ministry-years", requireRole(2), async (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) return res.status(400).json({ error: "Name, start date, and end date required" });
  await db.update(ministryYearsTable).set({ isActive: false });
  const created = await db.insert(ministryYearsTable).values({ name, startDate, endDate, isActive: true }).returning();
  res.status(201).json(created[0]);
});

router.delete("/ministry-years/:id", requireRole(2), async (req, res) => {
  const id = parseInt(req.params.id);
  const year = await db.select().from(ministryYearsTable).where(eq(ministryYearsTable.id, id)).limit(1);
  if (!year.length) return res.status(404).json({ error: "Ministry year not found" });
  const today = new Date().toISOString().split("T")[0];
  if (year[0].startDate <= today) {
    return res.status(400).json({ error: "Cannot delete a ministry year that has already started." });
  }
  await db.delete(ministryYearsTable).where(eq(ministryYearsTable.id, id));
  res.json({ success: true });
});

router.patch("/ministry-years/:id", requireRole(2), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, startDate, endDate, isActive, isClosed } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (startDate !== undefined) updates.startDate = startDate;
  if (endDate !== undefined) updates.endDate = endDate;
  if (isActive === true) {
    await db.update(ministryYearsTable).set({ isActive: false });
    updates.isActive = true;
  } else if (isActive === false) {
    updates.isActive = false;
  }
  if (isClosed === true) {
    updates.isClosed = true;
    updates.isActive = false;
  } else if (isClosed === false) {
    updates.isClosed = false;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });
  const updated = await db.update(ministryYearsTable).set(updates).where(eq(ministryYearsTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Ministry year not found" });
  res.json(updated[0]);
});

// ─── GIVING TYPES ─────────────────────────────────────────────────────────────

router.get("/giving-types", async (req, res) => {
  const types = await db.select().from(givingTypesTable).orderBy(givingTypesTable.name);
  res.json(types);
});

router.post("/giving-types", requireRole(2), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  const created = await db.insert(givingTypesTable).values({ name, description }).returning();
  res.status(201).json(created[0]);
});

router.patch("/giving-types/:id", requireRole(2), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });
  const updated = await db.update(givingTypesTable).set(updates).where(eq(givingTypesTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Giving type not found" });
  res.json(updated[0]);
});

// ─── COMBINED PERSON SEARCH (members + teens + children) ─────────────────────

router.get("/giving-search", async (req, res) => {
  const { q = "", type = "" } = req.query as any;
  if (!q || String(q).length < 2) return res.json([]);

  const term = `%${q}%`;
  const lim = type ? 20 : 10;
  const results: any[] = [];

  if (!type || type === "member") {
    const rows = await db.execute(sql`SELECT id, first_name, last_name, membership_id FROM members WHERE is_archived = false AND (first_name ILIKE ${term} OR last_name ILIKE ${term} OR (first_name || ' ' || last_name) ILIKE ${term}) LIMIT ${lim}`);
    results.push(...(rows as any[]).map(r => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, membershipId: r.membership_id, personType: "member" })));
  }
  if (!type || type === "teen") {
    const rows = await db.execute(sql`SELECT id, first_name, last_name FROM teens WHERE is_archived = false AND (first_name ILIKE ${term} OR last_name ILIKE ${term} OR (first_name || ' ' || last_name) ILIKE ${term}) LIMIT ${lim}`);
    results.push(...(rows as any[]).map(r => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, membershipId: null, personType: "teen" })));
  }
  if (!type || type === "child") {
    const rows = await db.execute(sql`SELECT id, first_name, last_name FROM children WHERE is_archived = false AND (first_name ILIKE ${term} OR last_name ILIKE ${term} OR (first_name || ' ' || last_name) ILIKE ${term}) LIMIT ${lim}`);
    results.push(...(rows as any[]).map(r => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, membershipId: null, personType: "child" })));
  }
  if (!type || type === "first_timer") {
    const rows = await db.execute(sql`SELECT id, first_name, last_name FROM first_timers WHERE is_archived = false AND (first_name ILIKE ${term} OR last_name ILIKE ${term} OR (first_name || ' ' || last_name) ILIKE ${term}) LIMIT ${lim}`);
    results.push(...(rows as any[]).map(r => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, membershipId: null, personType: "first_timer" })));
  }

  res.json(results);
});

// ─── GIVINGS ─────────────────────────────────────────────────────────────────

router.get("/givings", async (req, res) => {
  const { memberId, ministryYearId, givingTypeId, page = "1", limit = "25" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  let conditions: any[] = [eq(givingsTable.isArchived, false)];
  if (memberId) conditions.push(eq(givingsTable.memberId, parseInt(memberId)));
  if (ministryYearId) conditions.push(eq(givingsTable.ministryYearId, parseInt(ministryYearId)));
  if (givingTypeId) conditions.push(eq(givingsTable.givingTypeId, parseInt(givingTypeId)));

  const givings = await db.select().from(givingsTable).where(and(...conditions)).orderBy(givingsTable.date).limit(limitNum).offset(offset);
  const total = await db.select({ count: sql<number>`count(*)` }).from(givingsTable).where(and(...conditions));

  const enriched = await Promise.all(givings.map(async (g: any) => {
    const personName = await resolvePersonName(g);
    const gtype = await db.select().from(givingTypesTable).where(eq(givingTypesTable.id, g.givingTypeId)).limit(1);
    const year = await db.select().from(ministryYearsTable).where(eq(ministryYearsTable.id, g.ministryYearId)).limit(1);
    return {
      ...g,
      amount: parseFloat(String(g.amount)),
      memberName: personName,
      givingTypeName: gtype.length ? gtype[0].name : "Unknown",
      ministryYearName: year.length ? year[0].name : "Unknown",
    };
  }));

  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

router.post("/givings", async (req, res) => {
  const { memberId, teenId, childId, firstTimerId, personName, givingTypeId, amount, date, ministryYearId, notes } = req.body;
  if (!givingTypeId || !amount || !date || !ministryYearId) return res.status(400).json({ error: "Required fields missing" });
  if (!memberId && !teenId && !childId && !firstTimerId) return res.status(400).json({ error: "Person (member, teen, child, or first timer) required" });

  const user = (req as any).user;
  const created = await db.insert(givingsTable).values({
    memberId: memberId || null,
    teenId: teenId || null,
    childId: childId || null,
    firstTimerId: firstTimerId || null,
    personName: personName || null,
    givingTypeId,
    amount: String(amount),
    date,
    ministryYearId,
    notes,
    recordedBy: user.id,
  } as any).returning();

  const c = created[0] as any;
  const resolvedName = await resolvePersonName(c);
  const gtype = await db.select().from(givingTypesTable).where(eq(givingTypesTable.id, givingTypeId)).limit(1);
  const year = await db.select().from(ministryYearsTable).where(eq(ministryYearsTable.id, ministryYearId)).limit(1);
  res.status(201).json({
    ...c,
    amount: parseFloat(String(c.amount)),
    memberName: resolvedName,
    givingTypeName: gtype.length ? gtype[0].name : "Unknown",
    ministryYearName: year.length ? year[0].name : "Unknown",
  });
});

router.patch("/givings/:id", requireRole(2), async (req, res) => {
  const id = parseInt(req.params.id);
  const { memberId, teenId, childId, personName, givingTypeId, amount, date, ministryYearId, notes } = req.body;
  const updates: any = {};
  if (memberId !== undefined) updates.memberId = memberId;
  if (teenId !== undefined) updates.teenId = teenId;
  if (childId !== undefined) updates.childId = childId;
  if (personName !== undefined) updates.personName = personName;
  if (givingTypeId !== undefined) updates.givingTypeId = givingTypeId;
  if (amount !== undefined) updates.amount = String(amount);
  if (date !== undefined) updates.date = date;
  if (ministryYearId !== undefined) updates.ministryYearId = ministryYearId;
  if (notes !== undefined) updates.notes = notes;
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });

  const updated = await db.update(givingsTable).set(updates).where(eq(givingsTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Giving record not found" });

  const u = updated[0] as any;
  const resolvedName = await resolvePersonName(u);
  const gtype = u.givingTypeId ? await db.select().from(givingTypesTable).where(eq(givingTypesTable.id, u.givingTypeId)).limit(1) : [];
  const year = u.ministryYearId ? await db.select().from(ministryYearsTable).where(eq(ministryYearsTable.id, u.ministryYearId)).limit(1) : [];
  res.json({
    ...u,
    amount: parseFloat(String(u.amount)),
    memberName: resolvedName,
    givingTypeName: gtype.length ? (gtype[0] as any).name : "Unknown",
    ministryYearName: year.length ? (year[0] as any).name : "Unknown",
  });
});

router.delete("/givings/:id", requireRole(2), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(givingsTable).set({ isArchived: true } as any).where(eq(givingsTable.id, id));
  res.json({ success: true });
});

// ─── FINANCE REPORTS ──────────────────────────────────────────────────────────

router.get("/reports/finance", async (req, res) => {
  const { ministryYearId } = req.query as any;

  const allYears = await db.select().from(ministryYearsTable).orderBy(ministryYearsTable.startDate);
  const givingTypes = await db.select().from(givingTypesTable);

  const yearsToReport = ministryYearId
    ? allYears.filter(y => y.id === parseInt(ministryYearId))
    : allYears;

  const result = await Promise.all(yearsToReport.map(async (year) => {
    const conditions: any[] = [eq(givingsTable.isArchived, false), eq(givingsTable.ministryYearId, year.id)];
    const givings = await db.select().from(givingsTable).where(and(...conditions));

    const total = givings.reduce((a, g) => a + parseFloat(String(g.amount)), 0);
    const now = new Date().toISOString().split("T")[0];
    const isActive = year.isActive && now >= year.startDate && now <= year.endDate;

    const byType = await Promise.all(givingTypes.map(async (gt) => {
      const typeGivings = givings.filter(g => g.givingTypeId === gt.id);
      const typeTotal = typeGivings.reduce((a, g) => a + parseFloat(String(g.amount)), 0);

      const contributorMap = new Map<string, { id: string; name: string; amount: number }>();
      for (const g of typeGivings) {
        const gAny = g as any;
        const rawKey = gAny.memberId ?? gAny.teenId ?? gAny.childId ?? gAny.firstTimerId;
        const typePrefix = gAny.firstTimerId ? "ft" : gAny.teenId ? "teen" : gAny.childId ? "child" : "mbr";
        const key = rawKey ? `${typePrefix}:${rawKey}` : null;
        if (key) {
          if (!contributorMap.has(key)) {
            const name = await resolvePersonName(gAny);
            contributorMap.set(key, { id: key, name, amount: 0 });
          }
          contributorMap.get(key)!.amount += parseFloat(String(g.amount));
        }
      }
      const contributorNames = Array.from(contributorMap.values());

      return {
        givingTypeId: gt.id,
        givingTypeName: gt.name,
        count: contributorMap.size,
        total: typeTotal,
        contributors: contributorNames,
      };
    }));

    const thisMonth = new Date().toISOString().slice(0, 7);
    const thisMonthTotal = givings
      .filter(g => g.date && g.date.startsWith(thisMonth))
      .reduce((a, g) => a + parseFloat(String(g.amount)), 0);

    const uniqueContributors = new Set(givings.map((g: any) => {
      const gAny = g as any;
      const raw = gAny.memberId ?? gAny.teenId ?? gAny.childId ?? gAny.firstTimerId;
      return raw ? `${gAny.firstTimerId ? "ft" : gAny.teenId ? "teen" : gAny.childId ? "child" : "mbr"}:${raw}` : null;
    }).filter(Boolean));

    return {
      ministryYearId: year.id,
      ministryYearName: year.name,
      startDate: year.startDate,
      endDate: year.endDate,
      isActive,
      total,
      thisMonth: thisMonthTotal,
      contributorCount: uniqueContributors.size,
      byType,
    };
  }));

  if (ministryYearId) {
    const single = result[0];
    if (!single) return res.json({ total: 0, thisMonth: 0, contributorCount: 0, byType: [], byMonth: [] });
    const allGivings = await db.select().from(givingsTable).where(
      and(eq(givingsTable.isArchived, false), eq(givingsTable.ministryYearId, parseInt(ministryYearId)))
    );
    const byMonth: Record<string, number> = {};
    for (const g of allGivings) {
      if (!g.date) continue;
      const m = g.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + parseFloat(String(g.amount));
    }
    const byMonthArr = Object.entries(byMonth).sort().map(([month, total]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-GH", { month: "short", year: "2-digit" }),
      total,
    }));
    return res.json({ ...single, byMonth: byMonthArr });
  }

  res.json({ years: result });
});

export default router;
