import { Router } from "express";
import { db } from "@workspace/db";
import {
  childrenTable,
  teensTable,
  membersTable,
  familiesTable,
  familyChildrenTable,
} from "@workspace/db";
import { eq, and, ilike, or, ne, sql } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";

const router = Router();
router.use(authenticateToken);

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
        if (p.length) parentName = `${p[0].firstName} ${p[0].lastName}`;
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
  if (!firstName || !lastName || !childClass)
    return res
      .status(400)
      .json({ error: "First name, last name, and class required" });

  const created = await db
    .insert(childrenTable)
    .values({
      firstName,
      lastName,
      dateOfBirth,
      gender: gender || null,
      class: childClass,
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
        if (p.length) parentName = `${p[0].firstName} ${p[0].lastName}`;
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

  let data: any = { firstName, lastName, parentId: parentId || null, ...rest };
  if (transferFromChildId) {
    data.transferredFromChildId = transferFromChildId;
    // Find linked families before archiving the child
    const transferLinked = await db.select({ familyId: familyChildrenTable.familyId })
      .from(familyChildrenTable)
      .where(and(eq(familyChildrenTable.childId, transferFromChildId), eq(familyChildrenTable.type, "child")));
    await db.update(childrenTable)
      .set({ isArchived: true, archiveReason: "Transferred to Teens Church" })
      .where(eq(childrenTable.id, transferFromChildId));
    await db.delete(familyChildrenTable).where(
      and(eq(familyChildrenTable.childId, transferFromChildId), eq(familyChildrenTable.type, "child"))
    );
    for (const { familyId } of transferLinked) {
      await cleanupFamilyIfUndersized(familyId);
    }
  }

  const created = await db.insert(teensTable).values(data).returning();

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

  const updated = await db
    .update(teensTable)
    .set(req.body)
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

  const membershipId = await generateMembershipId(teen.firstName, teen.lastName);
  const pin = String(Math.floor(1000 + Math.random() * 9000));

  const created = await db.insert(membersTable).values({
    membershipId,
    firstName: teen.firstName,
    lastName: teen.lastName,
    gender,
    phone1: teen.phone1 ?? undefined,
    phone2: teen.phone2 ?? undefined,
    residentialAddress: teen.residentialAddress ?? undefined,
    dateJoined: teen.dateJoined ?? undefined,
    dateOfBirth: teen.dateOfBirth ?? undefined,
    foundationSchoolDate: teen.foundationSchoolDate ?? undefined,
    isBaptized: false,
    memberType: "member",
    pin,
  }).returning();

  // Find linked families before archiving
  const promoteLinked = await db.select({ familyId: familyChildrenTable.familyId })
    .from(familyChildrenTable)
    .where(and(eq(familyChildrenTable.teenId, id), eq(familyChildrenTable.type, "teen")));

  await db.update(teensTable)
    .set({ isArchived: true, archiveReason: "Promoted to Adult Members" })
    .where(eq(teensTable.id, id));

  await db.delete(familyChildrenTable).where(
    and(eq(familyChildrenTable.teenId, id), eq(familyChildrenTable.type, "teen"))
  );

  for (const { familyId } of promoteLinked) {
    await cleanupFamilyIfUndersized(familyId);
  }

  res.status(201).json(created[0]);
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
