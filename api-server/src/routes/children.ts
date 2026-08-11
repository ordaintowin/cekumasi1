import { Router } from "express";
import { db } from "@workspace/db";
import {
  childrenTable,
  teensTable,
  membersTable,
  usersTable,
  familiesTable,
  familyChildrenTable,
  serviceChildrenAttendanceTable,
  serviceTeensAttendanceTable,
  attendanceRecordsTable,
  servicesTable,
  givingsTable,
  givingTypesTable,
  ministryYearsTable,
  activityLogTable,
} from "@workspace/db";
import { eq, and, ilike, or, ne, sql, desc, inArray, isNull } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();
router.use(authenticateToken);

type RegisterType = "member" | "children" | "teens";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

type RegisterIds = {
  memberIds: number[];
  childIds: number[];
  teenIds: number[];
};

async function getRegisterIdsByMembershipId(
  membershipId: string,
  executor: any = db,
): Promise<RegisterIds> {
  const [members, children, teens] = await Promise.all([
    executor.select({ id: membersTable.id }).from(membersTable)
      .where(eq(membersTable.membershipId, membershipId)),
    executor.select({ id: childrenTable.id }).from(childrenTable)
      .where(eq(childrenTable.membershipId, membershipId)),
    executor.select({ id: teensTable.id }).from(teensTable)
      .where(eq(teensTable.membershipId, membershipId)),
  ]);
  return {
    memberIds: members.map((row: any) => row.id),
    childIds: children.map((row: any) => row.id),
    teenIds: teens.map((row: any) => row.id),
  };
}

function anyId(column: any, ids: number[]): any {
  return ids.length === 1 ? eq(column, ids[0]) : inArray(column, ids);
}

async function moveAttendance(
  tx: any,
  sourceType: RegisterType,
  sourceId: number,
  destinationType: RegisterType,
  destinationId: number,
  sourceCellId: number | null,
  membershipId: string,
) {
  const ids = await getRegisterIdsByMembershipId(membershipId, tx);
  const memberRows = ids.memberIds.length
    ? await tx.select().from(attendanceRecordsTable).where(anyId(attendanceRecordsTable.memberId, ids.memberIds))
    : [];
  const childRows = ids.childIds.length
    ? await tx.select().from(serviceChildrenAttendanceTable).where(anyId(serviceChildrenAttendanceTable.childId, ids.childIds))
    : [];
  const teenRows = ids.teenIds.length
    ? await tx.select().from(serviceTeensAttendanceTable).where(anyId(serviceTeensAttendanceTable.teenId, ids.teenIds))
    : [];

  const destinationTable = destinationType === "member"
    ? attendanceRecordsTable
    : destinationType === "children" ? serviceChildrenAttendanceTable : serviceTeensAttendanceTable;
  const destinationColumn = destinationType === "member"
    ? attendanceRecordsTable.memberId
    : destinationType === "children" ? serviceChildrenAttendanceTable.childId : serviceTeensAttendanceTable.teenId;
  const destinationKey = destinationType === "member" ? "memberId" : destinationType === "children" ? "childId" : "teenId";
  const rows = [
    ...memberRows.map((row: any) => ({ serviceId: row.serviceId, registeredAt: row.checkInTime, cellId: row.cellId, method: row.method })),
    ...childRows.map((row: any) => ({ serviceId: row.serviceId, registeredAt: row.registeredAt, cellId: sourceCellId, method: "ministry" })),
    ...teenRows.map((row: any) => ({ serviceId: row.serviceId, registeredAt: row.registeredAt, cellId: sourceCellId, method: "ministry" })),
  ];

  for (const row of rows) {
    const existing = await tx.select({ id: destinationTable.id }).from(destinationTable)
      .where(and(eq(destinationTable.serviceId, row.serviceId), eq(destinationColumn, destinationId))).limit(1);
    if (existing.length) continue;
    if (destinationType === "member") {
      await tx.insert(destinationTable).values({
        serviceId: row.serviceId, memberId: destinationId,
        cellId: row.cellId ?? sourceCellId, method: row.method ?? "ministry",
        checkInTime: row.registeredAt,
      });
    } else {
      await tx.insert(destinationTable).values({
        serviceId: row.serviceId, [destinationKey]: destinationId,
        registeredAt: row.registeredAt,
      });
    }
  }

  // The destination row is now the single current anchor. Historical check-in
  // dates/counts are preserved, but old register-specific duplicates are removed.
  const oldMemberIds = ids.memberIds.filter((id) => !(destinationType === "member" && id === destinationId));
  const oldChildIds = ids.childIds.filter((id) => !(destinationType === "children" && id === destinationId));
  const oldTeenIds = ids.teenIds.filter((id) => !(destinationType === "teens" && id === destinationId));
  if (oldMemberIds.length) await tx.delete(attendanceRecordsTable).where(anyId(attendanceRecordsTable.memberId, oldMemberIds));
  if (oldChildIds.length) await tx.delete(serviceChildrenAttendanceTable).where(anyId(serviceChildrenAttendanceTable.childId, oldChildIds));
  if (oldTeenIds.length) await tx.delete(serviceTeensAttendanceTable).where(anyId(serviceTeensAttendanceTable.teenId, oldTeenIds));
}

async function moveGiving(tx: any, sourceType: RegisterType, sourceId: number, destinationType: RegisterType, destinationId: number, membershipId: string) {
  const ids = await getRegisterIdsByMembershipId(membershipId, tx);
  const sourceConditions: any[] = [];
  if (ids.memberIds.length) sourceConditions.push(and(
    anyId(givingsTable.memberId, ids.memberIds),
    isNull(givingsTable.childId),
    isNull(givingsTable.teenId),
  ));
  if (ids.childIds.length) sourceConditions.push(and(
    anyId(givingsTable.childId, ids.childIds),
    isNull(givingsTable.memberId),
    isNull(givingsTable.teenId),
  ));
  if (ids.teenIds.length) sourceConditions.push(and(
    anyId(givingsTable.teenId, ids.teenIds),
    isNull(givingsTable.memberId),
    isNull(givingsTable.childId),
  ));
  if (!sourceConditions.length) return;
  const values: any = { memberId: null, childId: null, teenId: null };
  values[destinationType === "member" ? "memberId" : destinationType === "children" ? "childId" : "teenId"] = destinationId;
  await tx.update(givingsTable).set(values).where(or(...sourceConditions));
}

async function moveFamilyLinks(tx: any, sourceType: RegisterType, sourceId: number, destinationType: RegisterType, destinationId: number, membershipId: string) {
  const ids = await getRegisterIdsByMembershipId(membershipId, tx);
  const sourceConditions: any[] = [];
  if (ids.memberIds.length) sourceConditions.push(and(
    anyId(familyChildrenTable.memberId, ids.memberIds),
    eq(familyChildrenTable.type, "member"),
  ));
  if (ids.childIds.length) sourceConditions.push(and(
    anyId(familyChildrenTable.childId, ids.childIds),
    eq(familyChildrenTable.type, "child"),
  ));
  if (ids.teenIds.length) sourceConditions.push(and(
    anyId(familyChildrenTable.teenId, ids.teenIds),
    eq(familyChildrenTable.type, "teen"),
  ));
  if (!sourceConditions.length) return;
  const familyType = destinationType === "children" ? "child" : destinationType === "teens" ? "teen" : "member";
  const values: any = {
    type: familyType,
    memberId: null,
    childId: null,
    teenId: null,
  };
  values[destinationType === "member" ? "memberId" : destinationType === "children" ? "childId" : "teenId"] = destinationId;
  await tx.update(familyChildrenTable).set(values).where(or(...sourceConditions));

  // A person may have been moved more than once. Keep one link per family
  // after all historical register IDs have been consolidated.
  const links = await tx.select().from(familyChildrenTable).where(
    or(eq(familyChildrenTable.memberId, destinationType === "member" ? destinationId : -1),
      eq(familyChildrenTable.childId, destinationType === "children" ? destinationId : -1),
      eq(familyChildrenTable.teenId, destinationType === "teens" ? destinationId : -1))
  );
  const seenFamilies = new Set<number>();
  for (const link of links) {
    if (seenFamilies.has(link.familyId)) await tx.delete(familyChildrenTable).where(eq(familyChildrenTable.id, link.id));
    else seenFamilies.add(link.familyId);
  }
}

function registerLabel(type: RegisterType): string {
  return type === "member" ? "Adult Members" : type === "children" ? "Children's Church" : "Teens Church";
}

// Move one person between the three registers while retaining their permanent
// membership ID and moving stage-specific records to the new register row.
router.post("/register-transfer", async (req, res) => {
  const sourceType = req.body?.sourceType as RegisterType;
  const destinationType = req.body?.destinationType as RegisterType;
  const sourceId = Number(req.body?.sourceId);
  const validTypes: RegisterType[] = ["member", "children", "teens"];

  if (!validTypes.includes(sourceType) || !validTypes.includes(destinationType) || sourceType === destinationType) {
    return res.status(400).json({ error: "Choose two different valid registers." });
  }
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ error: "A valid person is required." });
  }

  const sourceRows = sourceType === "member"
    ? await db.select().from(membersTable).where(and(eq(membersTable.id, sourceId), eq(membersTable.isArchived, false))).limit(1)
    : sourceType === "children"
      ? await db.select().from(childrenTable).where(and(eq(childrenTable.id, sourceId), eq(childrenTable.isArchived, false))).limit(1)
      : await db.select().from(teensTable).where(and(eq(teensTable.id, sourceId), eq(teensTable.isArchived, false))).limit(1);
  if (!sourceRows.length) return res.status(404).json({ error: `${registerLabel(sourceType)} record not found.` });

  const source: any = sourceRows[0];
  const membershipId = source.membershipId;
  if (!membershipId) return res.status(400).json({ error: "This person does not have a membership ID and cannot be moved safely." });

  const destinationRows = destinationType === "member"
    ? await db.select().from(membersTable).where(eq(membersTable.membershipId, membershipId)).limit(1)
    : destinationType === "children"
      ? await db.select().from(childrenTable).where(eq(childrenTable.membershipId, membershipId)).limit(1)
      : await db.select().from(teensTable).where(eq(teensTable.membershipId, membershipId)).limit(1);
  const activeDestination = destinationRows.find((row: any) => !row.isArchived);
  if (activeDestination) {
    return res.status(409).json({ error: `${source.firstName} ${source.lastName} is already active in ${registerLabel(destinationType)}.` });
  }

  const actor = (req as any).user;
  const result = await db.transaction(async (tx) => {
    const sourceMemberId = sourceType === "member"
      ? source.id
      : source.sourceMemberId
        ?? (sourceType === "teens" ? source.transferredFromChildId : null);

    let destination: any;
    const existingDestination: any = destinationRows[0] ?? null;
    if (destinationType === "member") {
      const memberValues: any = {
        membershipId,
        firstName: source.firstName,
        lastName: source.lastName,
        gender: source.gender ?? "unspecified",
        phone1: source.phone1 ?? null,
        phone2: source.phone2 ?? null,
        email: source.email ?? null,
        occupation: source.occupation ?? "",
        residentialAddress: source.residentialAddress ?? "",
        emergencyContact: source.emergencyContact ?? "",
        dateOfBirth: source.dateOfBirth ?? null,
        dateJoined: source.dateJoined ?? null,
        foundationSchoolDate: source.foundationSchoolDate ?? null,
        pin: source.pin ?? "0000",
        memberType: "member",
        isArchived: false,
        archiveReason: null,
        archivedAt: null,
        archivedBy: null,
        transferredFromTeenId: sourceType === "teens" ? source.id : source.transferredFromTeenId ?? null,
      };
      if (existingDestination) {
        [destination] = await tx.update(membersTable).set(memberValues)
          .where(eq(membersTable.id, existingDestination.id)).returning();
      } else {
        [destination] = await tx.insert(membersTable).values({
          ...memberValues,
          isBaptized: false,
        }).returning();
      }
    } else if (destinationType === "children") {
      const childValues: any = {
        membershipId,
        sourceMemberId: sourceMemberId ?? null,
        firstName: source.firstName,
        lastName: source.lastName,
        gender: source.gender === "unspecified" ? null : source.gender ?? null,
        dateOfBirth: source.dateOfBirth ?? null,
        class: sourceType === "children" ? source.class ?? null : existingDestination?.class ?? null,
        parentId: source.parentId ?? existingDestination?.parentId ?? null,
        parentExternal: source.parentExternal ?? existingDestination?.parentExternal ?? null,
        isArchived: false,
        archiveReason: null,
      };
      if (existingDestination) {
        [destination] = await tx.update(childrenTable).set(childValues)
          .where(eq(childrenTable.id, existingDestination.id)).returning();
      } else {
        [destination] = await tx.insert(childrenTable).values(childValues).returning();
      }
    } else {
      const teenValues: any = {
        membershipId,
        sourceMemberId: sourceMemberId ?? null,
        transferredFromChildId: sourceType === "children" ? source.id : source.transferredFromChildId ?? null,
        pin: source.pin ?? "0000",
        firstName: source.firstName,
        lastName: source.lastName,
        gender: source.gender === "unspecified" ? null : source.gender ?? null,
        phone1: source.phone1 ?? null,
        phone2: source.phone2 ?? null,
        residentialAddress: source.residentialAddress ?? null,
        dateJoined: source.dateJoined ?? null,
        dateOfBirth: source.dateOfBirth ?? null,
        foundationSchoolCompleted: source.foundationSchoolCompleted ?? null,
        foundationSchoolDate: source.foundationSchoolDate ?? null,
        parentId: source.parentId ?? existingDestination?.parentId ?? null,
        parentExternal: source.parentExternal ?? existingDestination?.parentExternal ?? null,
        isArchived: false,
        archiveReason: null,
      };
      if (existingDestination) {
        [destination] = await tx.update(teensTable).set(teenValues)
          .where(eq(teensTable.id, existingDestination.id)).returning();
      } else {
        [destination] = await tx.insert(teensTable).values(teenValues).returning();
      }
    }

    const destinationMemberId = destinationType === "member" ? destination.id : sourceMemberId;
    await moveAttendance(tx, sourceType, source.id, destinationType, destination.id, source.cellId ?? null, membershipId);
    await moveGiving(tx, sourceType, source.id, destinationType, destination.id, membershipId);
    await moveFamilyLinks(tx, sourceType, source.id, destinationType, destination.id, membershipId);

    if (sourceType === "member" && destinationType !== "member") {
      await tx.update(usersTable).set({ isActive: false }).where(eq(usersTable.memberId, source.id));
    }
    if (destinationType === "member") {
      const memberUser = await tx.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.memberId, destination.id)).limit(1);
      if (memberUser.length) {
        await tx.update(usersTable).set({
          isActive: true,
          passwordHash: hashPassword(destination.pin ?? "0000"),
        }).where(eq(usersTable.id, memberUser[0].id));
      } else {
        await tx.insert(usersTable).values({
          username: membershipId,
          passwordHash: hashPassword(destination.pin ?? "0000"),
          roleLevel: 5,
          memberId: destination.id,
          isActive: true,
        });
      }
    }

    const sourceTable = sourceType === "member" ? membersTable : sourceType === "children" ? childrenTable : teensTable;
    await tx.update(sourceTable).set({
      isArchived: true,
      archiveReason: `Moved to ${registerLabel(destinationType)}`,
      ...(sourceType === "member" ? { archivedAt: new Date(), archivedBy: actor?.id ?? null } : {}),
    }).where(and(eq(sourceTable.id, source.id), eq(sourceTable.isArchived, false)));

    await tx.insert(activityLogTable).values({
      type: "register_transfer",
      description: `${source.firstName} ${source.lastName} was moved from ${registerLabel(sourceType)} to ${registerLabel(destinationType)}`,
      memberId: destinationMemberId ?? sourceMemberId ?? null,
      memberName: `${source.firstName} ${source.lastName}`,
      performedByUserId: actor?.id ?? null,
      performedByName: actor?.username ?? null,
    });

    return destination;
  });

  res.status(201).json({
    sourceType,
    destinationType,
    membershipId: result.membershipId,
    sourceId,
    destinationId: result.id,
    preservedHistoricalRecords: true,
  });
});

async function generateMembershipId(firstName: string, lastName: string): Promise<string> {
  const initials = ((firstName[0] ?? "X") + (lastName[0] ?? "X")).toUpperCase();
  const prefix = `CEKSI-${initials}`;
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

async function generateUniversalId(firstName: string, lastName: string): Promise<string> {
  const initials = ((firstName[0] ?? "X") + (lastName[0] ?? "X")).toUpperCase();
  const prefix = `CEKSI-${initials}`;
  const [m, t, c] = await Promise.all([
    db.select({ mid: membersTable.membershipId }).from(membersTable).where(ilike(membersTable.membershipId, `${prefix}%`)),
    db.select({ mid: teensTable.membershipId }).from(teensTable).where(ilike(teensTable.membershipId, `${prefix}%`)),
    db.select({ mid: childrenTable.membershipId }).from(childrenTable).where(ilike(childrenTable.membershipId, `${prefix}%`)),
  ]);
  let max = 0;
  for (const { mid } of [...m, ...t, ...c]) {
    if (!mid) continue;
    const num = parseInt(mid.slice(prefix.length), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// Auto-delete a family when fewer than 2 active members remain
async function cleanupFamilyIfUndersized(familyId: number) {
  const fam = await db.select().from(familiesTable).where(eq(familiesTable.id, familyId)).limit(1);
  if (!fam.length) return;
  const f = fam[0];

  let count = (f.headId ? 1 : 0) + (f.spouseId ? 1 : 0);

  const fcRows = await db.select().from(familyChildrenTable).where(eq(familyChildrenTable.familyId, familyId));
  for (const fc of fcRows) {
    if (fc.type === "child" && fc.childId) {
      const c = await db.select({ id: childrenTable.id }).from(childrenTable)
        .where(and(eq(childrenTable.id, fc.childId), eq(childrenTable.isArchived, false))).limit(1);
      if (c.length) count++;
    } else if (fc.type === "teen" && fc.teenId) {
      const t = await db.select({ id: teensTable.id }).from(teensTable)
        .where(and(eq(teensTable.id, fc.teenId), eq(teensTable.isArchived, false))).limit(1);
      if (t.length) count++;
    } else if (fc.type === "member" && fc.memberId) {
      count++;
    }
  }

  if (count < 2) {
    if (f.headId) await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, f.headId));
    if (f.spouseId) await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, f.spouseId));
    await db.delete(familyChildrenTable).where(eq(familyChildrenTable.familyId, familyId));
    await db.delete(familiesTable).where(eq(familiesTable.id, familyId));
  }
}

async function linkChildToParentFamily(
  parentId: number,
  childType: "child" | "teen",
  childEntityId: number
) {
  // Rule 4: check current family membership of this child/teen
  const prevFcCond = childType === "child"
    ? and(eq(familyChildrenTable.childId, childEntityId), eq(familyChildrenTable.type, "child"))
    : and(eq(familyChildrenTable.teenId, childEntityId), eq(familyChildrenTable.type, "teen"));
  const prevFc = await db.select().from(familyChildrenTable).where(prevFcCond).limit(1);

  // Find the parent's existing family
  let family: any = null;
  const asHead = await db.select().from(familiesTable).where(eq(familiesTable.headId, parentId)).limit(1);
  if (asHead.length) family = asHead[0];
  if (!family) {
    const asSpouse = await db.select().from(familiesTable).where(eq(familiesTable.spouseId, parentId)).limit(1);
    if (asSpouse.length) family = asSpouse[0];
  }

  if (!family) {
    // No family for parent yet — create one
    const member = await db.select().from(membersTable).where(eq(membersTable.id, parentId)).limit(1);
    if (!member.length) return;
    const famData: any = member[0].gender === "male" ? { headId: parentId } : { spouseId: parentId };

    // Rule 2: if parent has a spouse, include them in the new family
    const spouseId = member[0].spouseId;
    if (spouseId) {
      const spouseAlreadyIn = await db.select({ id: familiesTable.id }).from(familiesTable)
        .where(or(eq(familiesTable.headId, spouseId), eq(familiesTable.spouseId, spouseId))).limit(1);
      if (!spouseAlreadyIn.length) {
        if (member[0].gender === "male") famData.spouseId = spouseId;
        else famData.headId = spouseId;
      }
    }

    const created = await db.insert(familiesTable).values(famData).returning();
    family = created[0];
  } else {
    // Family already exists — Rule 2: fill in the other parent slot if parent has a spouse
    const parentRow = await db.select().from(membersTable).where(eq(membersTable.id, parentId)).limit(1);
    if (parentRow.length && parentRow[0].spouseId) {
      const spouseId = parentRow[0].spouseId;
      const slotUpdate: any = {};
      if (parentRow[0].gender === "male" && !family.spouseId) {
        const si = await db.select({ id: familiesTable.id }).from(familiesTable)
          .where(and(or(eq(familiesTable.headId, spouseId), eq(familiesTable.spouseId, spouseId)), ne(familiesTable.id, family.id))).limit(1);
        if (!si.length) slotUpdate.spouseId = spouseId;
      } else if (parentRow[0].gender === "female" && !family.headId) {
        const si = await db.select({ id: familiesTable.id }).from(familiesTable)
          .where(and(or(eq(familiesTable.headId, spouseId), eq(familiesTable.spouseId, spouseId)), ne(familiesTable.id, family.id))).limit(1);
        if (!si.length) slotUpdate.headId = spouseId;
      }
      if (Object.keys(slotUpdate).length) {
        await db.update(familiesTable).set(slotUpdate).where(eq(familiesTable.id, family.id));
        family = { ...family, ...slotUpdate };
      }
    }
  }

  // Rule 4: if child/teen is in a DIFFERENT family, remove them from there first
  if (prevFc.length && prevFc[0].familyId !== family.id) {
    await db.delete(familyChildrenTable).where(prevFcCond);
  }

  // Link to the target family if not already linked
  const conds: any[] = [
    eq(familyChildrenTable.familyId, family.id),
    eq(familyChildrenTable.type, childType),
  ];
  if (childType === "child") conds.push(eq(familyChildrenTable.childId, childEntityId));
  else conds.push(eq(familyChildrenTable.teenId, childEntityId));

  const existing = await db.select().from(familyChildrenTable).where(and(...conds)).limit(1);
  if (!existing.length) {
    const fcData: any = { familyId: family.id, type: childType };
    if (childType === "child") fcData.childId = childEntityId;
    else fcData.teenId = childEntityId;
    await db.insert(familyChildrenTable).values(fcData);
  }
}

// CHILDREN
router.get("/children", async (req, res) => {
  const { search, page = "1", limit = "25" } = req.query as any;
  const childClass = (req.query as any).class;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  let conditions: any[] = [eq(childrenTable.isArchived, false)];
  if (childClass) conditions.push(eq(childrenTable.class, childClass));
  if (search)
    conditions.push(
      or(
        ilike(childrenTable.firstName, `%${search}%`),
        ilike(childrenTable.lastName, `%${search}%`)
      )
    );

  const children = await db
    .select()
    .from(childrenTable)
    .where(and(...conditions))
    .orderBy(childrenTable.firstName)
    .limit(limitNum)
    .offset(offset);
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(childrenTable)
    .where(and(...conditions));

  const enriched = await Promise.all(
    children.map(async (c) => {
      let parentName = null;
      if (c.parentId) {
        const p = await db
          .select()
          .from(membersTable)
          .where(eq(membersTable.id, c.parentId))
          .limit(1);
        if (p.length) {
          if (p[0].spouseId) {
            // Couple linked — use the father's surname
            let fatherLastName = p[0].lastName;
            if (p[0].gender === "female") {
              // Recorded parent is the mother — fetch the father (spouse)
              const father = await db.select({ lastName: membersTable.lastName })
                .from(membersTable).where(eq(membersTable.id, p[0].spouseId)).limit(1);
              if (father.length) fatherLastName = father[0].lastName;
            }
            parentName = `${fatherLastName} Family`;
          } else {
            parentName = `${p[0].firstName} ${p[0].lastName}`;
          }
        }
      }
      return { ...c, parentName };
    })
  );

  res.json({
    data: enriched,
    total: Number(total[0].count),
    page: pageNum,
    limit: limitNum,
  });
});

router.post("/children", async (req, res) => {
  const {
    firstName,
    lastName,
    dateOfBirth,
    gender,
    class: childClass,
    parentId,
    parentExternal,
  } = req.body;
  if (!firstName || !lastName)
    return res
      .status(400)
      .json({ error: "First name and last name required" });

  const membershipId = await generateUniversalId(firstName, lastName);

  const created = await db
    .insert(childrenTable)
    .values({
      membershipId,
      firstName,
      lastName,
      dateOfBirth,
      gender: gender || null,
      class: childClass || null,
      parentId: parentId || null,
      parentExternal,
    })
    .returning();

  let parentName = null;
  if (parentId) {
    const p = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, parentId))
      .limit(1);
    if (p.length) parentName = `${p[0].firstName} ${p[0].lastName}`;
    await linkChildToParentFamily(parseInt(parentId), "child", created[0].id);
  }

  res.status(201).json({ ...created[0], parentName });
});

router.patch("/children/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    firstName,
    lastName,
    dateOfBirth,
    gender,
    class: childClass,
    parentId,
    parentExternal,
  } = req.body;

  const current = await db.select().from(childrenTable).where(eq(childrenTable.id, id)).limit(1);
  if (!current.length) return res.status(404).json({ error: "Child not found" });
  const oldParentId = current[0].parentId;

  const update: any = {};
  if (firstName !== undefined) update.firstName = firstName;
  if (lastName !== undefined) update.lastName = lastName;
  if (dateOfBirth !== undefined) update.dateOfBirth = dateOfBirth;
  if (gender !== undefined) update.gender = gender || null;
  if (childClass !== undefined) update.class = childClass;
  if (parentId !== undefined) update.parentId = parentId || null;
  if (parentExternal !== undefined) update.parentExternal = parentExternal;

  const updated = await db
    .update(childrenTable)
    .set(update)
    .where(eq(childrenTable.id, id))
    .returning();
  if (!updated.length)
    return res.status(404).json({ error: "Child not found" });

  if (parentId !== undefined) {
    const newParentId = parentId ? parseInt(parentId) : null;
    if (oldParentId && newParentId !== oldParentId) {
      const oldFamily = await db.select().from(familiesTable)
        .where(or(eq(familiesTable.headId, oldParentId), eq(familiesTable.spouseId, oldParentId))).limit(1);
      if (oldFamily.length) {
        await db.delete(familyChildrenTable).where(
          and(eq(familyChildrenTable.familyId, oldFamily[0].id), eq(familyChildrenTable.childId, id), eq(familyChildrenTable.type, "child"))
        );
        await cleanupFamilyIfUndersized(oldFamily[0].id);
      }
    }
    if (newParentId) {
      await linkChildToParentFamily(newParentId, "child", id);
    }
  }

  let parentName = null;
  if (updated[0].parentId) {
    const p = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, updated[0].parentId))
      .limit(1);
    if (p.length) parentName = `${p[0].firstName} ${p[0].lastName}`;
  }

  res.json({ ...updated[0], parentName });
});

router.delete("/children/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });

  // Find linked families before archiving so we can check sizing after
  const linkedFamilies = await db.select({ familyId: familyChildrenTable.familyId })
    .from(familyChildrenTable)
    .where(and(eq(familyChildrenTable.childId, id), eq(familyChildrenTable.type, "child")));

  await db.update(childrenTable).set({ isArchived: true, archiveReason: reason }).where(eq(childrenTable.id, id));

  // Remove from all family links so family/parent profiles stay clean
  await db.delete(familyChildrenTable).where(
    and(eq(familyChildrenTable.childId, id), eq(familyChildrenTable.type, "child"))
  );

  // Auto-delete any family that now has fewer than 2 active members
  for (const { familyId } of linkedFamilies) {
    await cleanupFamilyIfUndersized(familyId);
  }

  res.json({ success: true });
});

// Parent summary for a child — name, dob, last 20 services attended, last 20 givings
router.get("/children/:id/parent-summary", async (req, res) => {
  try {
  const id = parseInt(req.params.id);
  const child = await db.select().from(childrenTable).where(eq(childrenTable.id, id)).limit(1);
  if (!child.length) return res.status(404).json({ error: "Child not found" });

  const attendanceRows = await db
    .select({ serviceId: serviceChildrenAttendanceTable.serviceId, registeredAt: serviceChildrenAttendanceTable.registeredAt })
    .from(serviceChildrenAttendanceTable)
    .where(eq(serviceChildrenAttendanceTable.childId, id))
    .orderBy(desc(serviceChildrenAttendanceTable.registeredAt))
    .limit(20);

  const serviceIds = [...new Set(attendanceRows.map(r => r.serviceId))];
  let servicesMap: Record<number, any> = {};
  if (serviceIds.length) {
    const svcs = await db.select().from(servicesTable).where(inArray(servicesTable.id, serviceIds));
    svcs.forEach(s => { servicesMap[s.id] = s; });
  }

  const attendance = attendanceRows.map(r => ({
    serviceId: r.serviceId,
    registeredAt: r.registeredAt,
    serviceDate: servicesMap[r.serviceId]?.date ?? null,
    serviceName: servicesMap[r.serviceId]?.name ?? null,
    serviceType: servicesMap[r.serviceId]?.type ?? null,
  }));

  const givingRows = await db
    .select()
    .from(givingsTable)
    .where(and(eq(givingsTable.childId, id), eq(givingsTable.isArchived, false)))
    .orderBy(desc(givingsTable.date))
    .limit(20);

  const allGivingTypes = await db.select({ id: givingTypesTable.id, name: givingTypesTable.name }).from(givingTypesTable);
  const typesMap: Record<number, string> = {};
  allGivingTypes.forEach(gt => { typesMap[gt.id] = gt.name; });

  const givings = givingRows.map(g => ({
    id: g.id, date: g.date, amount: g.amount,
    givingType: typesMap[g.givingTypeId!] ?? "Gift",
    notes: g.notes,
  }));

  res.json({ ...child[0], attendance, givings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error loading child summary" });
  }
});

// Parent summary for a teen
router.get("/teens/:id/parent-summary", async (req, res) => {
  try {
  const id = parseInt(req.params.id);
  const teen = await db.select().from(teensTable).where(eq(teensTable.id, id)).limit(1);
  if (!teen.length) return res.status(404).json({ error: "Teen not found" });

  const attendanceRows = await db
    .select({ serviceId: serviceTeensAttendanceTable.serviceId, registeredAt: serviceTeensAttendanceTable.registeredAt })
    .from(serviceTeensAttendanceTable)
    .where(eq(serviceTeensAttendanceTable.teenId, id))
    .orderBy(desc(serviceTeensAttendanceTable.registeredAt))
    .limit(20);

  const serviceIds = [...new Set(attendanceRows.map(r => r.serviceId))];
  let servicesMap: Record<number, any> = {};
  if (serviceIds.length) {
    const svcs = await db.select().from(servicesTable).where(inArray(servicesTable.id, serviceIds));
    svcs.forEach(s => { servicesMap[s.id] = s; });
  }

  const attendance = attendanceRows.map(r => ({
    serviceId: r.serviceId,
    registeredAt: r.registeredAt,
    serviceDate: servicesMap[r.serviceId]?.date ?? null,
    serviceName: servicesMap[r.serviceId]?.name ?? null,
    serviceType: servicesMap[r.serviceId]?.type ?? null,
  }));

  // Only show givings from non-closed (active) ministry years
  const openYears = await db.select({ id: ministryYearsTable.id }).from(ministryYearsTable).where(eq(ministryYearsTable.isClosed, false));
  const openYearIds = openYears.map(y => y.id);

  // Fetch givings from teen stage + child stage (if this teen was promoted from children)
  const teenGivingRows = openYearIds.length ? await db
    .select()
    .from(givingsTable)
    .where(and(eq(givingsTable.teenId, id), eq(givingsTable.isArchived, false), inArray(givingsTable.ministryYearId, openYearIds)))
    .orderBy(desc(givingsTable.date))
    .limit(50) : [];

  let childGivingRows: typeof teenGivingRows = [];
  if (teen[0].transferredFromChildId) {
    childGivingRows = openYearIds.length ? await db
      .select()
      .from(givingsTable)
      .where(and(eq(givingsTable.childId, teen[0].transferredFromChildId), eq(givingsTable.isArchived, false), inArray(givingsTable.ministryYearId, openYearIds)))
      .orderBy(desc(givingsTable.date))
      .limit(50) : [];
  }

  const allGivingRows = [...teenGivingRows, ...childGivingRows]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 50);

  const allGivingTypes = await db.select({ id: givingTypesTable.id, name: givingTypesTable.name }).from(givingTypesTable);
  const typesMap: Record<number, string> = {};
  allGivingTypes.forEach(gt => { typesMap[gt.id] = gt.name; });

  const givings = allGivingRows.map(g => ({
    id: g.id, date: g.date, amount: g.amount,
    givingType: typesMap[g.givingTypeId!] ?? "Gift",
    notes: g.notes,
    stage: g.teenId ? "teen" : "child",
  }));

  res.json({ ...teen[0], attendance, givings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error loading teen summary" });
  }
});

// ─── TEEN ATTENDANCE HISTORY (ministry-year-filtered, paginated) ──────────────
router.get("/teens/:id/attendance-history", async (req, res) => {
  try {
    const teenId = parseInt(req.params.id);
    const ministryYearId = req.query.ministryYearId ? parseInt(req.query.ministryYearId as string) : undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "10")));
    const offset = (page - 1) * limit;

    const [teenRowA] = await db.select({ id: teensTable.id }).from(teensTable).where(eq(teensTable.id, teenId)).limit(1);
    if (!teenRowA) return res.status(404).json({ error: "Teen not found" });

    let serviceIdFilter: any = sql`true`;
    if (ministryYearId) {
      const [year] = await db.select().from(ministryYearsTable).where(eq(ministryYearsTable.id, ministryYearId)).limit(1);
      if (year) {
        const svcs = await db.select({ id: servicesTable.id }).from(servicesTable)
          .where(and(sql`${servicesTable.date} >= ${year.startDate}`, sql`${servicesTable.date} <= ${year.endDate}`));
        const ids = svcs.map((s: any) => s.id);
        serviceIdFilter = ids.length
          ? inArray(serviceTeensAttendanceTable.serviceId, ids)
          : sql`false`;
      }
    }

    const baseWhereA = and(eq(serviceTeensAttendanceTable.teenId, teenId), serviceIdFilter);
    const [cntA] = await db.select({ cnt: sql`count(*)` }).from(serviceTeensAttendanceTable).where(baseWhereA);
    const totalA = Number((cntA as any)?.cnt ?? 0);

    const rowsA = await db.select({ serviceId: serviceTeensAttendanceTable.serviceId, registeredAt: serviceTeensAttendanceTable.registeredAt })
      .from(serviceTeensAttendanceTable)
      .where(baseWhereA)
      .orderBy(desc(serviceTeensAttendanceTable.registeredAt))
      .limit(limit)
      .offset(offset);

    const uniqueSvcIds = [...new Set(rowsA.map((r: any) => r.serviceId))];
    const svcsMap: Record<number, any> = {};
    if (uniqueSvcIds.length) {
      const svcs = await db.select().from(servicesTable)
        .where(inArray(servicesTable.id, uniqueSvcIds));
      (svcs as any[]).forEach((s: any) => { svcsMap[s.id] = s; });
    }

    const dataA = rowsA.map((r: any) => ({
      serviceId: r.serviceId,
      checkInTime: r.registeredAt,
      serviceDate: svcsMap[r.serviceId]?.date ?? null,
      serviceName: svcsMap[r.serviceId]?.name ?? "Service",
      serviceType: svcsMap[r.serviceId]?.type ?? null,
      method: "manual",
    }));

    res.json({ data: dataA, total: totalA, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
});

// ─── TEEN GIVINGS HISTORY (ministry-year-filtered, paginated) ─────────────────
router.get("/teens/:id/givings-history", async (req, res) => {
  try {
    const teenId = parseInt(req.params.id);
    const ministryYearId = req.query.ministryYearId ? parseInt(req.query.ministryYearId as string) : undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "10")));
    const offset = (page - 1) * limit;

    const [teenRowG] = await db.select({ id: teensTable.id }).from(teensTable).where(eq(teensTable.id, teenId)).limit(1);
    if (!teenRowG) return res.status(404).json({ error: "Teen not found" });

    const yearFilter = ministryYearId ? eq(givingsTable.ministryYearId, ministryYearId) : undefined;
    const baseWhereG = and(eq(givingsTable.teenId, teenId), eq(givingsTable.isArchived, false), ...(yearFilter ? [yearFilter] : []));

    const [cntG] = await db.select({ cnt: sql`count(*)` }).from(givingsTable).where(baseWhereG);
    const totalG = Number((cntG as any)?.cnt ?? 0);

    const rowsG = await db.select().from(givingsTable).where(baseWhereG)
      .orderBy(desc(givingsTable.date))
      .limit(limit)
      .offset(offset);

    const allTypes = await db.select({ id: givingTypesTable.id, name: givingTypesTable.name }).from(givingTypesTable);
    const typesMap: Record<number, string> = {};
    (allTypes as any[]).forEach((gt: any) => { typesMap[gt.id] = gt.name; });

    const dataG = (rowsG as any[]).map((g: any) => ({
      id: g.id, date: g.date, amount: g.amount,
      givingTypeName: typesMap[g.givingTypeId] ?? "Gift",
      notes: g.notes,
    }));

    res.json({ data: dataG, total: totalG, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
});

// Parent can update only name and birthday of their child
router.patch("/children/:id/basic-info", async (req, res) => {
  const id = parseInt(req.params.id);
  const { firstName, lastName, dateOfBirth } = req.body;
  const update: any = {};
  if (firstName !== undefined) update.firstName = firstName.trim();
  if (lastName !== undefined) update.lastName = lastName.trim();
  if (dateOfBirth !== undefined) update.dateOfBirth = dateOfBirth || null;
  if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });
  const updated = await db.update(childrenTable).set(update).where(eq(childrenTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Child not found" });
  res.json(updated[0]);
});

// Parent can update only name and birthday of their teen
router.patch("/teens/:id/basic-info", async (req, res) => {
  const id = parseInt(req.params.id);
  const { firstName, lastName, dateOfBirth, phone1, phone2 } = req.body;
  const update: any = {};
  if (firstName !== undefined) update.firstName = firstName.trim();
  if (lastName !== undefined) update.lastName = lastName.trim();
  if (dateOfBirth !== undefined) update.dateOfBirth = dateOfBirth || null;
  if (phone1 !== undefined) update.phone1 = phone1.trim();
  if (phone2 !== undefined) update.phone2 = phone2.trim() || null;
  if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });
  const updated = await db.update(teensTable).set(update).where(eq(teensTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Teen not found" });
  res.json(updated[0]);
});

// TEENS
router.get("/teens", async (req, res) => {
  const { search, page = "1", limit = "25" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  let conditions: any[] = [eq(teensTable.isArchived, false)];
  if (search)
    conditions.push(
      or(
        ilike(teensTable.firstName, `%${search}%`),
        ilike(teensTable.lastName, `%${search}%`)
      )
    );

  const teens = await db
    .select()
    .from(teensTable)
    .where(and(...conditions))
    .orderBy(teensTable.firstName)
    .limit(limitNum)
    .offset(offset);
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(teensTable)
    .where(and(...conditions));

  const enriched = await Promise.all(
    teens.map(async (t) => {
      let parentName = null;
      if (t.parentId) {
        const p = await db
          .select()
          .from(membersTable)
          .where(eq(membersTable.id, t.parentId))
          .limit(1);
        if (p.length) {
          if (p[0].spouseId) {
            // Couple linked — use the father's surname
            let fatherLastName = p[0].lastName;
            if (p[0].gender === "female") {
              // Recorded parent is the mother — fetch the father (spouse)
              const father = await db.select({ lastName: membersTable.lastName })
                .from(membersTable).where(eq(membersTable.id, p[0].spouseId)).limit(1);
              if (father.length) fatherLastName = father[0].lastName;
            }
            parentName = `${fatherLastName} Family`;
          } else {
            parentName = `${p[0].firstName} ${p[0].lastName}`;
          }
        }
      }
      return { ...t, parentName };
    })
  );

  res.json({
    data: enriched,
    total: Number(total[0].count),
    page: pageNum,
    limit: limitNum,
  });
});

router.post("/teens", async (req, res) => {
  const { firstName, lastName, transferFromChildId, parentId, ...rest } =
    req.body;
  if (!firstName || !lastName)
    return res
      .status(400)
      .json({ error: "First name and last name required" });

  // ── Duplicate detection (only when phone is provided and not a child-transfer) ──
  // A duplicate is: same phone number AND names match in either order
  // (e.g. "Victor Mensah" == "Mensah Victor").
  // Two DIFFERENT names sharing the same phone are allowed (teens share parent phones).
  if (!transferFromChildId && rest.phone1) {
    const phone = String(rest.phone1).trim();
    const fn = firstName.trim().toLowerCase();
    const ln = lastName.trim().toLowerCase();

    const dup = await db.select({ id: teensTable.id, firstName: teensTable.firstName, lastName: teensTable.lastName })
      .from(teensTable)
      .where(
        and(
          eq(teensTable.isArchived, false),
          // phone matches on either phone1 or phone2 of the existing teen
          or(
            sql`LOWER(TRIM(${teensTable.phone1})) = LOWER(TRIM(${phone}))`,
            sql`LOWER(TRIM(${teensTable.phone2})) = LOWER(TRIM(${phone}))`
          ),
          // names match in either order (catches first/last name swaps)
          or(
            and(
              sql`LOWER(TRIM(${teensTable.firstName})) = ${fn}`,
              sql`LOWER(TRIM(${teensTable.lastName})) = ${ln}`
            ),
            and(
              sql`LOWER(TRIM(${teensTable.firstName})) = ${ln}`,
              sql`LOWER(TRIM(${teensTable.lastName})) = ${fn}`
            )
          )
        )
      ).limit(1);

    if (dup.length) {
      const existing = dup[0];
      return res.status(409).json({
        error: `A teen named ${existing.firstName} ${existing.lastName} with this phone number already exists. Please check for duplicates.`,
      });
    }
  }

  // If promoting from a child, carry over their existing membership ID so it stays permanent
  let membershipId: string;
  if (transferFromChildId) {
    const childRow = await db.select({ membershipId: childrenTable.membershipId })
      .from(childrenTable).where(eq(childrenTable.id, transferFromChildId)).limit(1);
    membershipId = (childRow.length && childRow[0].membershipId)
      ? childRow[0].membershipId
      : await generateUniversalId(firstName, lastName);
  } else {
    membershipId = await generateUniversalId(firstName, lastName);
  }
  const pin = String(Math.floor(1000 + Math.random() * 9000));

  let data: any = { membershipId, pin, firstName, lastName, parentId: parentId || null, ...rest };
  if (transferFromChildId) {
    data.transferredFromChildId = transferFromChildId;
    await db.update(childrenTable)
      .set({ isArchived: true, archiveReason: "Transferred to Teens Church" })
      .where(eq(childrenTable.id, transferFromChildId));
  }

  const created = await db.insert(teensTable).values(data).returning();

  if (transferFromChildId) {
    // Migrate the family_children row child→teen so the family link is preserved
    await db.update(familyChildrenTable)
      .set({ type: "teen", teenId: created[0].id, childId: null })
      .where(and(eq(familyChildrenTable.childId, transferFromChildId), eq(familyChildrenTable.type, "child")));
  }

  let parentName = null;
  if (parentId) {
    const p = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, parseInt(parentId)))
      .limit(1);
    if (p.length) parentName = `${p[0].firstName} ${p[0].lastName}`;
    await linkChildToParentFamily(
      parseInt(parentId),
      "teen",
      created[0].id
    );
  }

  res.status(201).json({ ...created[0], parentName });
});

router.patch("/teens/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const current = await db.select().from(teensTable).where(eq(teensTable.id, id)).limit(1);
  if (!current.length) return res.status(404).json({ error: "Teen not found" });
  const oldParentId = current[0].parentId;

  // Never allow membership ID to change — strip it from any incoming update
  const { membershipId: _ignored, ...safeBody } = req.body;
  const updated = await db
    .update(teensTable)
    .set(safeBody)
    .where(eq(teensTable.id, id))
    .returning();
  if (!updated.length)
    return res.status(404).json({ error: "Teen not found" });

  const incomingParentId = req.body.parentId;
  if (incomingParentId !== undefined) {
    const newParentId = incomingParentId ? parseInt(incomingParentId) : null;
    if (oldParentId && newParentId !== oldParentId) {
      const oldFamily = await db.select().from(familiesTable)
        .where(or(eq(familiesTable.headId, oldParentId), eq(familiesTable.spouseId, oldParentId))).limit(1);
      if (oldFamily.length) {
        await db.delete(familyChildrenTable).where(
          and(eq(familyChildrenTable.familyId, oldFamily[0].id), eq(familyChildrenTable.teenId, id), eq(familyChildrenTable.type, "teen"))
        );
        await cleanupFamilyIfUndersized(oldFamily[0].id);
      }
    }
    if (newParentId) {
      await linkChildToParentFamily(newParentId, "teen", id);
    }
  }

  let parentName = null;
  if (updated[0].parentId) {
    const p = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, updated[0].parentId))
      .limit(1);
    if (p.length) parentName = `${p[0].firstName} ${p[0].lastName}`;
  }

  res.json({ ...updated[0], parentName });
});

router.post("/teens/:id/promote", async (req, res) => {
  const id = parseInt(req.params.id);
  const { gender } = req.body;
  if (!gender) return res.status(400).json({ error: "Gender is required to promote teen to member" });

  const teens = await db.select().from(teensTable).where(eq(teensTable.id, id)).limit(1);
  if (!teens.length) return res.status(404).json({ error: "Teen not found" });
  const teen = teens[0];

  // Carry over the teen's existing membership ID and PIN — both are permanent across promotions
  const membershipId = teen.membershipId ?? await generateUniversalId(teen.firstName, teen.lastName);
  const pin = teen.pin ?? "0000";

  // A member moved into Teens Church is archived, not deleted. Move that same
  // row back when possible so its numeric ID remains the anchor for attendance,
  // giving, family links, and any other historical member references.
  const sourceMember = teen.sourceMemberId
    ? await db.select().from(membersTable).where(eq(membersTable.id, teen.sourceMemberId)).limit(1)
    : [];
  const archivedMember = sourceMember.length
    ? sourceMember
    : await db.select().from(membersTable)
      .where(and(eq(membersTable.membershipId, membershipId), eq(membersTable.isArchived, true)))
      .limit(1);
  const activeMember = await db.select({ id: membersTable.id })
    .from(membersTable)
    .where(and(eq(membersTable.membershipId, membershipId), eq(membersTable.isArchived, false)))
    .limit(1);
  if (activeMember.length) {
    return res.status(409).json({ error: "A member with this membership ID is already active." });
  }

  const actor = (req as any).user;
  const result = await db.transaction(async (tx) => {
    let member: any;
    const memberValues = {
      membershipId,
      firstName: teen.firstName,
      lastName: teen.lastName,
      gender,
      phone1: teen.phone1 ?? "",
      phone2: teen.phone2 ?? null,
      residentialAddress: teen.residentialAddress ?? "",
      dateJoined: teen.dateJoined ?? null,
      dateOfBirth: teen.dateOfBirth ?? null,
      foundationSchoolDate: teen.foundationSchoolDate ?? null,
      pin,
      isArchived: false,
      archiveReason: null,
      archivedAt: null,
      archivedBy: null,
      transferredFromTeenId: id,
    };

    if (archivedMember.length) {
      [member] = await tx.update(membersTable)
        .set(memberValues)
        .where(eq(membersTable.id, archivedMember[0].id))
        .returning();
    } else {
      [member] = await tx.insert(membersTable).values({
        ...memberValues,
        isBaptized: false,
        memberType: "member",
      }).returning();
    }

    await tx.update(teensTable)
      .set({ isArchived: true, archiveReason: "Promoted to Adult Members" })
      .where(and(eq(teensTable.id, id), eq(teensTable.isArchived, false)));

    // Migrate the family_children row teen→member so the family link is preserved.
    await tx.update(familyChildrenTable)
      .set({ type: "member", memberId: member.id, teenId: null })
      .where(and(eq(familyChildrenTable.teenId, id), eq(familyChildrenTable.type, "teen")));

    await tx.insert(activityLogTable).values({
      type: "teen_promoted_to_member",
      description: `${teen.firstName} ${teen.lastName} was moved from Teens Church to Adult Members`,
      memberId: member.id,
      memberName: `${teen.firstName} ${teen.lastName}`,
      performedByUserId: actor?.id ?? null,
      performedByName: actor?.username ?? null,
    });

    return member;
  });

  res.status(201).json({
    ...result,
    reusedArchivedMember: archivedMember.length > 0,
    preservedHistoricalRecords: true,
  });
});

router.delete("/teens/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "Reason required" });

  // Find linked families before archiving
  const linkedFamilies = await db.select({ familyId: familyChildrenTable.familyId })
    .from(familyChildrenTable)
    .where(and(eq(familyChildrenTable.teenId, id), eq(familyChildrenTable.type, "teen")));

  await db.update(teensTable).set({ isArchived: true, archiveReason: reason }).where(eq(teensTable.id, id));

  // Remove from all family links so family/parent profiles stay clean
  await db.delete(familyChildrenTable).where(
    and(eq(familyChildrenTable.teenId, id), eq(familyChildrenTable.type, "teen"))
  );

  // Auto-delete any family that now has fewer than 2 active members
  for (const { familyId } of linkedFamilies) {
    await cleanupFamilyIfUndersized(familyId);
  }

  res.json({ success: true });
});

export default router;
