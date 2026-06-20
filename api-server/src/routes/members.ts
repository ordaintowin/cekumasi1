import { Router } from "express";
import { db } from "@workspace/db";
import {
  membersTable, usersTable, leadershipRolesTable, activityLogTable,
  cellsTable, seniorCellsTable, pcfsTable,
  departmentMembersTable, departmentsTable, givingsTable, attendanceRecordsTable,
  familiesTable, familyChildrenTable, ministryYearsTable, servicesTable, givingTypesTable,
} from "@workspace/db";
import { eq, and, ilike, or, sql, ne, gte, lte, inArray } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();
router.use(authenticateToken);

function fmt(m: { title?: string | null; firstName: string; lastName: string }): string {
  return m.title ? `${m.title} ${m.firstName} ${m.lastName}` : `${m.firstName} ${m.lastName}`;
}

async function generateMembershipId(firstName: string, lastName: string, type: "member" | "visitor" = "member"): Promise<string> {
  const initials = ((firstName[0] ?? "X") + (lastName[0] ?? "X")).toUpperCase();
  const prefix = type === "visitor" ? `VST-${initials}` : `CEKSI-${initials}`;
  const existing = await db
    .select({ membershipId: membersTable.membershipId })
    .from(membersTable)
    .where(ilike(membersTable.membershipId, `${prefix}%`));
  let max = 0;
  for (const row of existing) {
    const num = parseInt(row.membershipId.slice(prefix.length), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

async function getActiveMinistryYear() {
  const today = new Date().toISOString().split("T")[0];
  const years = await db.select().from(ministryYearsTable)
    .where(and(
      eq(ministryYearsTable.isClosed, false),
      lte(ministryYearsTable.startDate, today),
      gte(ministryYearsTable.endDate, today),
    ));
  if (!years.length) return null;
  return years[0];
}

async function getMemberWithRoles(id: number) {
  const member = await db.select().from(membersTable)
    .where(and(eq(membersTable.id, id), eq(membersTable.isArchived, false))).limit(1);
  if (!member.length) return null;
  const m = member[0];
  const roles = await db.select().from(leadershipRolesTable).where(eq(leadershipRolesTable.memberId, id));

  let cellName: string | null = null;
  let seniorCellName: string | null = null;
  let pcfName: string | null = null;
  if (m.cellId) {
    const cell = await db.select().from(cellsTable).where(eq(cellsTable.id, m.cellId)).limit(1);
    if (cell.length) {
      cellName = cell[0].name;
      if (cell[0].seniorCellId) {
        const sc = await db.select().from(seniorCellsTable).where(eq(seniorCellsTable.id, cell[0].seniorCellId)).limit(1);
        if (sc.length) {
          seniorCellName = sc[0].name;
          if (sc[0].pcfId) {
            const pcf = await db.select().from(pcfsTable).where(eq(pcfsTable.id, sc[0].pcfId)).limit(1);
            if (pcf.length) pcfName = pcf[0].name;
          }
        }
      }
    }
  }

  let spouseName: string | null = null;
  if (m.spouseId) {
    const spouse = await db.select().from(membersTable).where(eq(membersTable.id, m.spouseId)).limit(1);
    if (spouse.length) spouseName = fmt(spouse[0]);
  }

  const deptRows = await db
    .select({ name: departmentsTable.name, isHead: departmentMembersTable.isHead, subUnit: departmentMembersTable.subUnit, headId: departmentsTable.headId })
    .from(departmentMembersTable)
    .innerJoin(departmentsTable, eq(departmentMembersTable.departmentId, departmentsTable.id))
    .where(eq(departmentMembersTable.memberId, id));
  const departments = deptRows.map(d => d.name);
  const departmentMemberships = deptRows.map(d => ({ name: d.name, subUnit: d.subUnit, isHead: d.isHead || d.headId === id }));

  // Leadership positions — live from fellowship tables
  const [leadsCell, leadsSC, leadsPCF] = await Promise.all([
    db.select({ id: cellsTable.id, name: cellsTable.name }).from(cellsTable)
      .where(and(eq(cellsTable.leaderId, id), eq(cellsTable.isArchived, false))).limit(1),
    db.select({ id: seniorCellsTable.id, name: seniorCellsTable.name }).from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.leaderId, id), eq(seniorCellsTable.isArchived, false))).limit(1),
    db.select({ id: pcfsTable.id, name: pcfsTable.name }).from(pcfsTable)
      .where(and(eq(pcfsTable.leaderId, id), eq(pcfsTable.isArchived, false))).limit(1),
  ]);
  const leadershipPositions = {
    cellLeader: leadsCell.length ? { id: leadsCell[0].id, name: leadsCell[0].name } : null,
    seniorCellLeader: leadsSC.length ? { id: leadsSC[0].id, name: leadsSC[0].name } : null,
    pcfLeader: leadsPCF.length ? { id: leadsPCF[0].id, name: leadsPCF[0].name } : null,
  };

  const activeYear = await getActiveMinistryYear();

  // Total all-time attendance
  const attCnt = await db.select({ count: sql<number>`count(*)` })
    .from(attendanceRecordsTable).where(eq(attendanceRecordsTable.memberId, id));
  const attendanceCount = Number(attCnt[0].count);

  // Giving summary (all-time)
  const allGivings = await db.select({ amount: givingsTable.amount })
    .from(givingsTable).where(and(eq(givingsTable.memberId, id), eq(givingsTable.isArchived, false)));
  const givingTotal = allGivings.reduce((a, g) => a + Number(g.amount), 0);
  const givingSummary = { total: givingTotal };

  // This-year stats (scoped to active ministry year)
  let attendanceThisYear = 0;
  let givingTotalThisYear = 0;
  let activeMinistryYear: any = null;

  if (activeYear) {
    activeMinistryYear = activeYear;

    // Get services within the active year date range
    const servicesInYear = await db.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        sql`date >= ${activeYear.startDate}`,
        sql`date <= ${activeYear.endDate}`,
      ));
    const serviceIds = servicesInYear.map(s => s.id);

    if (serviceIds.length > 0) {
      const attThisYear = await db.select({ count: sql<number>`count(*)` })
        .from(attendanceRecordsTable)
        .where(and(
          eq(attendanceRecordsTable.memberId, id),
          inArray(attendanceRecordsTable.serviceId, serviceIds),
        ));
      attendanceThisYear = Number(attThisYear[0].count);
    }

    const givingsThisYear = await db.select({ amount: givingsTable.amount })
      .from(givingsTable)
      .where(and(
        eq(givingsTable.memberId, id),
        eq(givingsTable.isArchived, false),
        eq(givingsTable.ministryYearId, activeYear.id),
      ));
    givingTotalThisYear = givingsThisYear.reduce((a, g) => a + Number(g.amount), 0);
  }

  return {
    ...m,
    leadershipRoles: roles.map(r => r.role),
    leadershipPositions,
    cellName, seniorCellName, pcfName, spouseName,
    departments, departmentMemberships,
    attendanceCount, givingSummary,
    attendanceThisYear, givingTotalThisYear, activeMinistryYear,
  };
}

router.get("/", async (req, res) => {
  const { search, type, cellId, seniorCellId, pcfId, page = "1", limit = "25" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [eq(membersTable.isArchived, false)];
  if (type === "member") conditions.push(eq(membersTable.memberType, "member"));
  if (type === "visitor") conditions.push(eq(membersTable.memberType, "visitor"));
  if (cellId) conditions.push(eq(membersTable.cellId, parseInt(cellId)));
  if (seniorCellId) {
    const cellsInSC = await db.select({ id: cellsTable.id }).from(cellsTable)
      .where(and(eq(cellsTable.seniorCellId, parseInt(seniorCellId)), eq(cellsTable.isArchived, false)));
    const scCellIds = cellsInSC.map((c) => c.id);
    conditions.push(scCellIds.length > 0 ? inArray(membersTable.cellId, scCellIds) : sql`false`);
  }
  if (pcfId) {
    const scsInPCF = await db.select({ id: seniorCellsTable.id }).from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.pcfId, parseInt(pcfId)), eq(seniorCellsTable.isArchived, false)));
    const pcfScIds = scsInPCF.map((sc) => sc.id);
    if (pcfScIds.length > 0) {
      const cellsInPCF = await db.select({ id: cellsTable.id }).from(cellsTable)
        .where(and(inArray(cellsTable.seniorCellId, pcfScIds), eq(cellsTable.isArchived, false)));
      const pcfCellIds = cellsInPCF.map((c) => c.id);
      conditions.push(pcfCellIds.length > 0 ? inArray(membersTable.cellId, pcfCellIds) : sql`false`);
    } else {
      conditions.push(sql`false`);
    }
  }
  if (search) {
    conditions.push(or(
      ilike(membersTable.firstName, `%${search}%`),
      ilike(membersTable.lastName, `%${search}%`),
      ilike(membersTable.phone1, `%${search}%`),
      ilike(membersTable.membershipId, `%${search}%`)
    ));
  }

  const members = await db.select().from(membersTable)
    .where(and(...conditions)).limit(limitNum).offset(offset).orderBy(membersTable.firstName);
  const total = await db.select({ count: sql<number>`count(*)` })
    .from(membersTable).where(and(...conditions));

  const enriched = await Promise.all(members.map(async (m) => {
    const roles = await db.select().from(leadershipRolesTable).where(eq(leadershipRolesTable.memberId, m.id));
    let cellName: string | null = null;
    let seniorCellName: string | null = null;
    let pcfName: string | null = null;
    if (m.cellId) {
      const cell = await db.select({ name: cellsTable.name, seniorCellId: cellsTable.seniorCellId }).from(cellsTable).where(eq(cellsTable.id, m.cellId)).limit(1);
      if (cell.length) {
        cellName = cell[0].name;
        if (cell[0].seniorCellId) {
          const sc = await db.select({ name: seniorCellsTable.name, pcfId: seniorCellsTable.pcfId }).from(seniorCellsTable).where(eq(seniorCellsTable.id, cell[0].seniorCellId)).limit(1);
          if (sc.length) {
            seniorCellName = sc[0].name;
            if (sc[0].pcfId) {
              const pcf = await db.select({ name: pcfsTable.name }).from(pcfsTable).where(eq(pcfsTable.id, sc[0].pcfId)).limit(1);
              if (pcf.length) pcfName = pcf[0].name;
            }
          }
        }
      }
    }
    return { ...m, leadershipRoles: roles.map(r => r.role), cellName, seniorCellName, pcfName };
  }));

  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

router.post("/", async (req, res) => {
  const { firstName, lastName, gender, phone1, memberType = "member", ...rest } = req.body;
  if (!firstName || !lastName || !gender || !phone1) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const existing = await db.select().from(membersTable).where(
    and(
      or(eq(membersTable.phone1, phone1), eq(membersTable.phone2, phone1)),
      eq(membersTable.isArchived, false)
    )
  ).limit(1);
  if (existing.length) {
    const m = existing[0];
    return res.status(409).json({
      error: `This phone number is already registered to ${fmt(m)} (${m.membershipId}). Two people cannot share the same phone number.`,
    });
  }

  const selectedSpouseId = rest.spouseId ? parseInt(rest.spouseId) : null;
  if (selectedSpouseId) {
    const spouseRecord = await db.select().from(membersTable)
      .where(and(eq(membersTable.id, selectedSpouseId), eq(membersTable.isArchived, false))).limit(1);
    if (!spouseRecord.length) return res.status(404).json({ error: "Selected spouse not found." });
    if (spouseRecord[0].gender === gender) return res.status(400).json({ error: "Same-sex couples are not permitted." });
    const usedAsSpouse = await db.select({ id: membersTable.id }).from(membersTable)
      .where(and(eq(membersTable.spouseId, selectedSpouseId), eq(membersTable.isArchived, false))).limit(1);
    if (usedAsSpouse.length) return res.status(409).json({ error: "This person is already linked as a spouse to another member." });
    if (spouseRecord[0].spouseId) return res.status(409).json({ error: "This person already has a spouse linked to their profile." });
  }

  const pin = generatePin();
  const created = await db.insert(membersTable).values({
    membershipId: await generateMembershipId(firstName, lastName, memberType === "visitor" ? "visitor" : "member"),
    firstName, lastName, gender, phone1, memberType, pin, ...rest,
  }).returning();

  const actor = (req as any).user;
  await db.insert(activityLogTable).values({
    type: "new_member",
    description: `${memberType === "visitor" ? "Visitor" : "Member"} ${created[0].title ? created[0].title + " " : ""}${firstName} ${lastName} was added`,
    memberId: created[0].id, memberName: `${firstName} ${lastName}`,
    performedByUserId: actor?.id ?? null,
    performedByName: actor?.username ?? null,
  });

  if (memberType === "member") {
    const existingUser = await db.select().from(usersTable).where(eq(usersTable.memberId, created[0].id)).limit(1);
    if (!existingUser.length) {
      await db.insert(usersTable).values({
        username: created[0].membershipId,
        passwordHash: hashPassword(pin),
        roleLevel: 5,
        memberId: created[0].id,
      });
    }
  }

  const newMemberId = created[0].id;
  if (selectedSpouseId) {
    const spouseUpdates: Record<string, any> = { spouseId: newMemberId, maritalStatus: "married" };
    if (rest.weddingDate) spouseUpdates.weddingDate = rest.weddingDate;
    await db.update(membersTable).set(spouseUpdates).where(eq(membersTable.id, selectedSpouseId));
  }

  if (memberType === "member" && rest.maritalStatus === "married" && selectedSpouseId) {
    // Rule 3a: check if the spouse is already in a partial family
    const spouseExistingFamily = await db.select().from(familiesTable)
      .where(or(eq(familiesTable.headId, selectedSpouseId), eq(familiesTable.spouseId, selectedSpouseId))).limit(1);
    if (spouseExistingFamily.length) {
      // Spouse already in a family — fill the empty slot with the new member
      const sf = spouseExistingFamily[0];
      if (gender === "male" && !sf.headId) {
        await db.update(familiesTable).set({ headId: newMemberId }).where(eq(familiesTable.id, sf.id));
      } else if (gender === "female" && !sf.spouseId) {
        await db.update(familiesTable).set({ spouseId: newMemberId }).where(eq(familiesTable.id, sf.id));
      }
    } else {
      // Neither in a family — create new
      const newMemberAlreadyIn = await db.select({ id: familiesTable.id }).from(familiesTable)
        .where(or(eq(familiesTable.headId, newMemberId), eq(familiesTable.spouseId, newMemberId))).limit(1);
      if (!newMemberAlreadyIn.length) {
        if (gender === "male") {
          await db.insert(familiesTable).values({ headId: newMemberId, spouseId: selectedSpouseId });
        } else {
          await db.insert(familiesTable).values({ headId: selectedSpouseId, spouseId: newMemberId });
        }
      }
    }
  }

  res.status(201).json({ ...created[0], leadershipRoles: [] });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const member = await getMemberWithRoles(id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  res.json(member);
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { firstName, lastName, phone1, ...rest } = req.body;

  const currentMember = await db.select().from(membersTable)
    .where(and(eq(membersTable.id, id), eq(membersTable.isArchived, false))).limit(1);
  if (!currentMember.length) return res.status(404).json({ error: "Member not found" });
  const currentGender = (rest.gender ?? currentMember[0].gender) as string;
  const oldSpouseId = currentMember[0].spouseId;

  const incomingSpouseId = Object.prototype.hasOwnProperty.call(rest, "spouseId")
    ? (rest.spouseId ? parseInt(rest.spouseId) : null)
    : undefined;

  if (incomingSpouseId !== undefined && incomingSpouseId !== null) {
    const newSpouseId = incomingSpouseId;
    const spouseRecord = await db.select().from(membersTable)
      .where(and(eq(membersTable.id, newSpouseId), eq(membersTable.isArchived, false))).limit(1);
    if (!spouseRecord.length) return res.status(404).json({ error: "Selected spouse not found." });
    if (spouseRecord[0].gender === currentGender) return res.status(400).json({ error: "Same-sex couples are not permitted." });
    const spouseAlready = await db.select({ id: membersTable.id }).from(membersTable)
      .where(and(eq(membersTable.spouseId, newSpouseId), eq(membersTable.isArchived, false), ne(membersTable.id, id))).limit(1);
    if (spouseAlready.length) return res.status(409).json({ error: "This person is already linked as a spouse to another member." });
    if (spouseRecord[0].spouseId && spouseRecord[0].spouseId !== id) return res.status(409).json({ error: "This person already has a spouse linked to their profile." });
  }

  if (phone1) {
    const existing = await db.select().from(membersTable).where(
      and(or(eq(membersTable.phone1, phone1), eq(membersTable.phone2, phone1)), eq(membersTable.isArchived, false), ne(membersTable.id, id))
    ).limit(1);
    if (existing.length) {
      const m = existing[0];
      return res.status(409).json({ error: `This phone number is already registered to ${fmt(m)} (${m.membershipId}).` });
    }
  }

  const updated = await db.update(membersTable)
    .set({ firstName, lastName, phone1, ...rest }).where(eq(membersTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Member not found" });

  if (incomingSpouseId !== undefined) {
    if (incomingSpouseId === null) {
      // Spouse being cleared — clear other side's link and remove from family slot
      if (oldSpouseId) {
        await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, oldSpouseId));
      }
      // Rule 1: Remove this member from family slot when spouse is cleared
      const myFamily = await db.select().from(familiesTable)
        .where(or(eq(familiesTable.headId, id), eq(familiesTable.spouseId, id))).limit(1);
      if (myFamily.length) {
        const fam = myFamily[0];
        if (fam.headId === id) {
          await db.update(familiesTable).set({ headId: null }).where(eq(familiesTable.id, fam.id));
        } else {
          await db.update(familiesTable).set({ spouseId: null }).where(eq(familiesTable.id, fam.id));
        }
        // Delete the family if both slots now empty and no children remain
        const updatedFam = await db.select().from(familiesTable).where(eq(familiesTable.id, fam.id)).limit(1);
        if (updatedFam.length && !updatedFam[0].headId && !updatedFam[0].spouseId) {
          const kidCount = await db.select({ count: sql<number>`count(*)` }).from(familyChildrenTable).where(eq(familyChildrenTable.familyId, fam.id));
          if (Number(kidCount[0].count) === 0) {
            await db.delete(familiesTable).where(eq(familiesTable.id, fam.id));
          }
        }
      }
    } else {
      if (oldSpouseId && oldSpouseId !== incomingSpouseId) {
        await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, oldSpouseId));
      }
      const spouseUpdates: Record<string, any> = { spouseId: id, maritalStatus: "married" };
      if (rest.weddingDate) spouseUpdates.weddingDate = rest.weddingDate;
      await db.update(membersTable).set(spouseUpdates).where(eq(membersTable.id, incomingSpouseId));

      // Rule 3a: handle partial families — fill existing slot or merge families
      const myFamily = await db.select().from(familiesTable)
        .where(or(eq(familiesTable.headId, id), eq(familiesTable.spouseId, id))).limit(1);
      const spouseExistingFamily = await db.select().from(familiesTable)
        .where(or(eq(familiesTable.headId, incomingSpouseId), eq(familiesTable.spouseId, incomingSpouseId))).limit(1);
      const g = currentGender as string;

      if (myFamily.length) {
        // This member is already in a family — fill the empty slot with the spouse
        const fam = myFamily[0];
        if (g === "male" && !fam.spouseId) {
          await db.update(familiesTable).set({ spouseId: incomingSpouseId }).where(eq(familiesTable.id, fam.id));
        } else if (g === "female" && !fam.headId) {
          await db.update(familiesTable).set({ headId: incomingSpouseId }).where(eq(familiesTable.id, fam.id));
        }
        // If spouse had a different partial family, move its children over then delete it
        if (spouseExistingFamily.length && spouseExistingFamily[0].id !== fam.id) {
          await db.update(familyChildrenTable).set({ familyId: fam.id }).where(eq(familyChildrenTable.familyId, spouseExistingFamily[0].id));
          await db.delete(familiesTable).where(eq(familiesTable.id, spouseExistingFamily[0].id));
        }
      } else if (spouseExistingFamily.length) {
        // Spouse is already in a family — fill the empty slot with this member
        const sf = spouseExistingFamily[0];
        if (g === "male" && !sf.headId) {
          await db.update(familiesTable).set({ headId: id }).where(eq(familiesTable.id, sf.id));
        } else if (g === "female" && !sf.spouseId) {
          await db.update(familiesTable).set({ spouseId: id }).where(eq(familiesTable.id, sf.id));
        }
      } else {
        // Neither in a family — create new
        if (g === "male") {
          await db.insert(familiesTable).values({ headId: id, spouseId: incomingSpouseId });
        } else {
          await db.insert(familiesTable).values({ headId: incomingSpouseId, spouseId: id });
        }
      }
    }
  } else if (rest.weddingDate && oldSpouseId) {
    await db.update(membersTable).set({ weddingDate: rest.weddingDate }).where(eq(membersTable.id, oldSpouseId));
  }

  // Rule 1: If marital status is being changed to non-married without an explicit spouse change,
  // remove this member from their family slot and delete the family if both slots are now empty
  const maritalStatusChangingToNonMarried =
    Object.prototype.hasOwnProperty.call(rest, "maritalStatus") &&
    rest.maritalStatus !== "married";
  if (maritalStatusChangingToNonMarried && incomingSpouseId === undefined) {
    const myFamily = await db.select().from(familiesTable)
      .where(or(eq(familiesTable.headId, id), eq(familiesTable.spouseId, id))).limit(1);
    if (myFamily.length) {
      const fam = myFamily[0];
      const otherMemberId = fam.headId === id ? fam.spouseId : fam.headId;
      // Clear this member's slot
      if (fam.headId === id) {
        await db.update(familiesTable).set({ headId: null }).where(eq(familiesTable.id, fam.id));
      } else {
        await db.update(familiesTable).set({ spouseId: null }).where(eq(familiesTable.id, fam.id));
      }
      // Clear spouseId on both members
      await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, id));
      if (otherMemberId) {
        await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, otherMemberId));
      }
      // Delete family if both slots empty and no children
      const updatedFam = await db.select().from(familiesTable).where(eq(familiesTable.id, fam.id)).limit(1);
      if (updatedFam.length && !updatedFam[0].headId && !updatedFam[0].spouseId) {
        const kidCount = await db.select({ count: sql<number>`count(*)` }).from(familyChildrenTable).where(eq(familyChildrenTable.familyId, fam.id));
        if (Number(kidCount[0].count) === 0) {
          await db.delete(familiesTable).where(eq(familiesTable.id, fam.id));
        }
      }
    }
  }

  const member = await getMemberWithRoles(id);
  res.json(member ?? updated[0]);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  const user = (req as any).user;
  if (!reason) return res.status(400).json({ error: "Reason required" });

  // ── Family cleanup: dissolve any family this member is an adult in ───────
  // Rule: a family requires both adults — archiving either one dissolves it.
  const myFamily = await db
    .select()
    .from(familiesTable)
    .where(or(eq(familiesTable.headId, id), eq(familiesTable.spouseId, id)))
    .limit(1);
  if (myFamily.length) {
    const fam = myFamily[0];
    const otherId = fam.headId === id ? fam.spouseId : fam.headId;
    // Clear spouseId on the other adult
    if (otherId)
      await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, otherId));
    // Delete family_children rows and the family record itself
    await db.delete(familyChildrenTable).where(eq(familyChildrenTable.familyId, fam.id));
    await db.delete(familiesTable).where(eq(familiesTable.id, fam.id));
  }
  // Also remove this member from any family_children rows (where they appear as a child/member)
  await db
    .delete(familyChildrenTable)
    .where(and(eq(familyChildrenTable.memberId, id), eq(familyChildrenTable.type, "member")));

  await db.update(membersTable)
    .set({ isArchived: true, archiveReason: reason, archivedAt: new Date(), archivedBy: user.id })
    .where(eq(membersTable.id, id));
  res.json({ success: true });
});

router.post("/:id/convert", async (req, res) => {
  const id = parseInt(req.params.id);
  const { cellId } = req.body;
  if (!cellId) return res.status(400).json({ error: "Cell ID required" });
  const updated = await db.update(membersTable)
    .set({ memberType: "member", cellId }).where(eq(membersTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Member not found" });
  res.json({ ...updated[0], leadershipRoles: [] });
});

router.post("/:id/send-credentials", async (req, res) => {
  res.json({ success: true, message: "Credentials send request noted." });
});

// ─── MEMBER CREDENTIALS ───────────────────────────────────────────────────────

router.get("/:id/credentials", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  const member = await db.select({ id: membersTable.id, pin: membersTable.pin, membershipId: membersTable.membershipId })
    .from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member.length) return res.status(404).json({ error: "Member not found" });

  // Only get the member's personal account (level 4 or 5), never show admin/staff accounts
  const user = await db.select({ id: usersTable.id, username: usersTable.username, isActive: usersTable.isActive, roleLevel: usersTable.roleLevel })
    .from(usersTable).where(and(eq(usersTable.memberId, id), gte(usersTable.roleLevel, 4))).limit(1);

  res.json({
    memberId: id,
    membershipId: member[0].membershipId,
    pin: member[0].pin,
    hasAccount: user.length > 0,
    // Always use membershipId as the login identifier (PIN login uses membershipId, not admin username)
    username: member[0].membershipId,
    isActive: user.length ? user[0].isActive : true,
    roleLevel: user.length ? user[0].roleLevel : 5,
  });
});

router.post("/:id/reset-password", requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  const { newPin, newPassword } = req.body;

  const member = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member.length) return res.status(404).json({ error: "Member not found" });

  const pin = newPin || generatePin();
  await db.update(membersTable).set({ pin }).where(eq(membersTable.id, id));

  const password = newPassword || pin;
  const passwordHash = hashPassword(password);

  const user = await db.select().from(usersTable).where(eq(usersTable.memberId, id)).limit(1);
  if (user.length) {
    await db.update(usersTable).set({ passwordHash, isActive: true }).where(eq(usersTable.memberId, id));
  } else {
    await db.insert(usersTable).values({
      username: member[0].membershipId,
      passwordHash,
      roleLevel: 5,
      memberId: id,
    });
  }

  res.json({ success: true, newPin: pin, message: `Password reset. New PIN: ${pin}` });
});

// ─── MEMBER GIVINGS (paginated) ───────────────────────────────────────────────

router.get("/:id/givings", async (req, res) => {
  const memberId = parseInt(req.params.id);
  const { ministryYearId, page = "1", limit = "20" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 50);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [eq(givingsTable.memberId, memberId), eq(givingsTable.isArchived, false)];
  if (ministryYearId) conditions.push(eq(givingsTable.ministryYearId, parseInt(ministryYearId)));

  const givings = await db.select().from(givingsTable).where(and(...conditions))
    .orderBy(givingsTable.date).limit(limitNum).offset(offset);
  const total = await db.select({ count: sql<number>`count(*)` }).from(givingsTable).where(and(...conditions));

  const enriched = await Promise.all(givings.map(async (g) => {
    const gtype = await db.select().from(givingTypesTable).where(eq(givingTypesTable.id, g.givingTypeId)).limit(1);
    const year = await db.select().from(ministryYearsTable).where(eq(ministryYearsTable.id, g.ministryYearId)).limit(1);
    return {
      ...g,
      amount: parseFloat(String(g.amount)),
      givingTypeName: gtype.length ? gtype[0].name : "Unknown",
      ministryYearName: year.length ? year[0].name : "Unknown",
    };
  }));

  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

// ─── MEMBER ATTENDANCE (paginated) ───────────────────────────────────────────

router.get("/:id/attendance", async (req, res) => {
  const memberId = parseInt(req.params.id);
  const { ministryYearId, page = "1", limit = "20" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 50);
  const offset = (pageNum - 1) * limitNum;

  let serviceIds: number[] = [];
  if (ministryYearId) {
    const year = await db.select().from(ministryYearsTable).where(eq(ministryYearsTable.id, parseInt(ministryYearId))).limit(1);
    if (year.length) {
      const services = await db.select({ id: servicesTable.id }).from(servicesTable)
        .where(and(sql`date >= ${year[0].startDate}`, sql`date <= ${year[0].endDate}`));
      serviceIds = services.map(s => s.id);
    }
  }

  const conditions: any[] = [eq(attendanceRecordsTable.memberId, memberId)];
  if (serviceIds.length > 0) conditions.push(inArray(attendanceRecordsTable.serviceId, serviceIds));

  const records = await db.select().from(attendanceRecordsTable).where(and(...conditions))
    .orderBy(attendanceRecordsTable.checkInTime).limit(limitNum).offset(offset);
  const total = await db.select({ count: sql<number>`count(*)` })
    .from(attendanceRecordsTable).where(and(...conditions));

  const enriched = await Promise.all(records.map(async (r) => {
    const svc = await db.select().from(servicesTable).where(eq(servicesTable.id, r.serviceId)).limit(1);
    return { ...r, serviceName: svc.length ? svc[0].name : "Unknown", serviceDate: svc.length ? svc[0].date : null };
  }));

  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

export default router;
