import { Router } from "express";
import { db } from "@workspace/db";
import { familiesTable, familyChildrenTable, membersTable, childrenTable, teensTable } from "@workspace/db";
import { eq, and, ilike, or, ne, inArray } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";

const router = Router();
router.use(authenticateToken);

function fmt(m: { title?: string | null; firstName: string; lastName: string }): string {
  return m.title ? `${m.title} ${m.firstName} ${m.lastName}` : `${m.firstName} ${m.lastName}`;
}

async function getMemberName(id: number | null | undefined): Promise<string | null> {
  if (!id) return null;
  const m = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  return m.length ? fmt(m[0]) : null;
}

async function getFamilyDetail(fam: any) {
  const fatherName = await getMemberName(fam.headId);
  const motherName = await getMemberName(fam.spouseId);

  const surname =
    fatherName?.split(" ").pop() ?? motherName?.split(" ").pop() ?? "Unknown";

  const fc = await db
    .select()
    .from(familyChildrenTable)
    .where(eq(familyChildrenTable.familyId, fam.id));

  const children: any[] = [];
  for (const f of fc) {
    if (f.type === "child" && f.childId) {
      const c = await db
        .select()
        .from(childrenTable)
        .where(and(eq(childrenTable.id, f.childId), eq(childrenTable.isArchived, false)))
        .limit(1);
      if (c.length)
        children.push({
          id: f.childId,
          name: `${c[0].firstName} ${c[0].lastName}`,
          source: "child",
          sourceLabel: "Children's Church",
          class: c[0].class,
        });
      else
        await db.delete(familyChildrenTable).where(and(eq(familyChildrenTable.familyId, fam.id), eq(familyChildrenTable.childId, f.childId), eq(familyChildrenTable.type, "child")));
    } else if (f.type === "teen" && f.teenId) {
      const t = await db
        .select()
        .from(teensTable)
        .where(and(eq(teensTable.id, f.teenId), eq(teensTable.isArchived, false)))
        .limit(1);
      if (t.length)
        children.push({
          id: f.teenId,
          name: `${t[0].firstName} ${t[0].lastName}`,
          source: "teen",
          sourceLabel: "Teens",
        });
      else
        await db.delete(familyChildrenTable).where(and(eq(familyChildrenTable.familyId, fam.id), eq(familyChildrenTable.teenId, f.teenId), eq(familyChildrenTable.type, "teen")));
    } else if (f.type === "member" && f.memberId) {
      const m = await db
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, f.memberId))
        .limit(1);
      if (m.length)
        children.push({
          id: f.memberId,
          name: `${m[0].firstName} ${m[0].lastName}`,
          source: "member",
          sourceLabel: "Member",
        });
    }
  }

  const memberCount =
    (fam.headId ? 1 : 0) + (fam.spouseId ? 1 : 0) + children.length;

  return {
    id: fam.id,
    name: `${surname} Family`,
    fatherId: fam.headId,
    motherId: fam.spouseId,
    fatherName,
    motherName,
    children,
    memberCount,
    createdAt: fam.createdAt,
  };
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

async function isMemberInAnyFamily(
  memberId: number,
  excludeFamilyId?: number
): Promise<boolean> {
  const headCond = excludeFamilyId
    ? and(eq(familiesTable.headId, memberId), ne(familiesTable.id, excludeFamilyId))
    : eq(familiesTable.headId, memberId);
  const asHead = await db
    .select({ id: familiesTable.id })
    .from(familiesTable)
    .where(headCond)
    .limit(1);
  if (asHead.length) return true;

  const spouseCond = excludeFamilyId
    ? and(eq(familiesTable.spouseId, memberId), ne(familiesTable.id, excludeFamilyId))
    : eq(familiesTable.spouseId, memberId);
  const asSpouse = await db
    .select({ id: familiesTable.id })
    .from(familiesTable)
    .where(spouseCond)
    .limit(1);
  if (asSpouse.length) return true;

  const childCond = excludeFamilyId
    ? and(
        eq(familyChildrenTable.memberId, memberId),
        eq(familyChildrenTable.type, "member"),
        ne(familyChildrenTable.familyId, excludeFamilyId)
      )
    : and(
        eq(familyChildrenTable.memberId, memberId),
        eq(familyChildrenTable.type, "member")
      );
  const asChild = await db
    .select()
    .from(familyChildrenTable)
    .where(childCond)
    .limit(1);
  return asChild.length > 0;
}

router.get("/", async (req, res) => {
  const { search, memberId, teenId } = req.query as any;
  let families = await db
    .select()
    .from(familiesTable)
    .orderBy(familiesTable.createdAt);

  if (memberId) {
    const mId = parseInt(memberId);
    const childRows = await db
      .select({ familyId: familyChildrenTable.familyId })
      .from(familyChildrenTable)
      .where(and(eq(familyChildrenTable.memberId, mId), eq(familyChildrenTable.type, "member")));
    const childFamilyIds = childRows.map(r => r.familyId);
    families = families.filter(
      (f) =>
        f.headId === mId ||
        f.spouseId === mId ||
        childFamilyIds.includes(f.id)
    );
  } else if (teenId) {
    const tId = parseInt(teenId);
    const teenRows = await db
      .select({ familyId: familyChildrenTable.familyId })
      .from(familyChildrenTable)
      .where(and(eq(familyChildrenTable.teenId, tId), eq(familyChildrenTable.type, "teen")));
    const teenFamilyIds = teenRows.map(r => r.familyId);
    families = families.filter((f) => teenFamilyIds.includes(f.id));
  } else if (search) {
    const members = await db
      .select()
      .from(membersTable)
      .where(
        or(
          ilike(membersTable.firstName, `%${search}%`),
          ilike(membersTable.lastName, `%${search}%`)
        )
      );
    const memberIds = new Set(members.map((m) => m.id));
    families = families.filter(
      (f) =>
        (f.headId && memberIds.has(f.headId)) ||
        (f.spouseId && memberIds.has(f.spouseId))
    );
  }
  const enriched = await Promise.all(families.map(getFamilyDetail));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  const {
    fatherId,
    motherId,
    childIds = [],
    teenIds = [],
    memberChildIds = [],
  } = req.body;

  if (!fatherId) return res.status(400).json({ error: "Father is required" });
  if (!motherId) return res.status(400).json({ error: "Mother is required" });
  if (parseInt(fatherId) === parseInt(motherId))
    return res
      .status(400)
      .json({ error: "Father and Mother must be different people" });

  const memberChildIdNums = memberChildIds.map(Number);
  if (
    memberChildIdNums.includes(parseInt(fatherId)) ||
    memberChildIdNums.includes(parseInt(motherId))
  )
    return res
      .status(400)
      .json({ error: "Father or Mother cannot also be listed as a child" });

  const father = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, parseInt(fatherId)))
    .limit(1);
  if (!father.length) return res.status(404).json({ error: "Father not found" });
  if (father[0].gender !== "male")
    return res.status(400).json({ error: "Father must be a male member" });

  const mother = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, parseInt(motherId)))
    .limit(1);
  if (!mother.length) return res.status(404).json({ error: "Mother not found" });
  if (mother[0].gender !== "female")
    return res.status(400).json({ error: "Mother must be a female member" });

  if (await isMemberInAnyFamily(parseInt(fatherId)))
    return res
      .status(409)
      .json({ error: `${father[0].firstName} ${father[0].lastName} is already in another family` });

  if (await isMemberInAnyFamily(parseInt(motherId)))
    return res
      .status(409)
      .json({ error: `${mother[0].firstName} ${mother[0].lastName} is already in another family` });

  for (const cId of childIds.map(Number)) {
    const existing = await db
      .select()
      .from(familyChildrenTable)
      .where(
        and(eq(familyChildrenTable.childId, cId), eq(familyChildrenTable.type, "child"))
      )
      .limit(1);
    if (existing.length)
      return res
        .status(409)
        .json({ error: "One or more children are already in another family" });
  }
  for (const tId of teenIds.map(Number)) {
    const existing = await db
      .select()
      .from(familyChildrenTable)
      .where(
        and(eq(familyChildrenTable.teenId, tId), eq(familyChildrenTable.type, "teen"))
      )
      .limit(1);
    if (existing.length)
      return res
        .status(409)
        .json({ error: "One or more teens are already in another family" });
  }
  for (const mId of memberChildIdNums) {
    if (await isMemberInAnyFamily(mId))
      return res
        .status(409)
        .json({ error: "One or more member-children are already in another family" });
  }

  const created = await db
    .insert(familiesTable)
    .values({ headId: parseInt(fatherId), spouseId: parseInt(motherId) })
    .returning();
  const famId = created[0].id;

  for (const cId of childIds.map(Number))
    await db
      .insert(familyChildrenTable)
      .values({ familyId: famId, childId: cId, type: "child" });
  for (const tId of teenIds.map(Number))
    await db
      .insert(familyChildrenTable)
      .values({ familyId: famId, teenId: tId, type: "teen" });
  for (const mId of memberChildIdNums)
    await db
      .insert(familyChildrenTable)
      .values({ familyId: famId, memberId: mId, type: "member" });

  // Sync spouseId on both members so member records stay accurate
  await db.update(membersTable).set({ spouseId: parseInt(motherId), maritalStatus: "married" }).where(eq(membersTable.id, parseInt(fatherId)));
  await db.update(membersTable).set({ spouseId: parseInt(fatherId), maritalStatus: "married" }).where(eq(membersTable.id, parseInt(motherId)));

  res.status(201).json(await getFamilyDetail(created[0]));
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { fatherId, motherId, childIds, teenIds, memberChildIds } = req.body;

  const fam = await db
    .select()
    .from(familiesTable)
    .where(eq(familiesTable.id, id))
    .limit(1);
  if (!fam.length) return res.status(404).json({ error: "Family not found" });

  // ── Rule: removing either adult dissolves the whole family ──────────────
  // A family requires both a head and a spouse. If either is explicitly
  // removed (set to null/falsy), delete the family entirely.
  const removingFather = fatherId !== undefined && !fatherId;
  const removingMother = motherId !== undefined && !motherId;

  if (removingFather || removingMother) {
    // Clear spouse links on both adult members
    if (fam[0].headId)
      await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, fam[0].headId));
    if (fam[0].spouseId)
      await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, fam[0].spouseId));
    // Delete all children links then the family
    await db.delete(familyChildrenTable).where(eq(familyChildrenTable.familyId, id));
    await db.delete(familiesTable).where(eq(familiesTable.id, id));
    return res.json({ deleted: true, reason: "Family dissolved — an adult member was removed" });
  }

  // ── Normal edit: both adults remain, only details change ────────────────
  const update: any = {};

  if (fatherId !== undefined) {
    const father = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, parseInt(fatherId)))
      .limit(1);
    if (!father.length) return res.status(404).json({ error: "Father not found" });
    if (father[0].gender !== "male")
      return res.status(400).json({ error: "Father must be a male member" });
    if (await isMemberInAnyFamily(parseInt(fatherId), id))
      return res.status(409).json({
        error: `${father[0].firstName} ${father[0].lastName} is already in another family`,
      });
    update.headId = parseInt(fatherId);
  }

  if (motherId !== undefined) {
    const mother = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, parseInt(motherId)))
      .limit(1);
    if (!mother.length) return res.status(404).json({ error: "Mother not found" });
    if (mother[0].gender !== "female")
      return res.status(400).json({ error: "Mother must be a female member" });
    if (await isMemberInAnyFamily(parseInt(motherId), id))
      return res.status(409).json({
        error: `${mother[0].firstName} ${mother[0].lastName} is already in another family`,
      });
    update.spouseId = parseInt(motherId);
  }

  if (Object.keys(update).length > 0)
    await db.update(familiesTable).set(update).where(eq(familiesTable.id, id));

  if (childIds !== undefined) {
    await db
      .delete(familyChildrenTable)
      .where(
        and(eq(familyChildrenTable.familyId, id), eq(familyChildrenTable.type, "child"))
      );
    for (const cId of (childIds as number[]))
      await db
        .insert(familyChildrenTable)
        .values({ familyId: id, childId: cId, type: "child" });
  }
  if (teenIds !== undefined) {
    await db
      .delete(familyChildrenTable)
      .where(
        and(eq(familyChildrenTable.familyId, id), eq(familyChildrenTable.type, "teen"))
      );
    for (const tId of (teenIds as number[]))
      await db
        .insert(familyChildrenTable)
        .values({ familyId: id, teenId: tId, type: "teen" });
  }
  if (memberChildIds !== undefined) {
    await db
      .delete(familyChildrenTable)
      .where(
        and(
          eq(familyChildrenTable.familyId, id),
          eq(familyChildrenTable.type, "member")
        )
      );
    for (const mId of (memberChildIds as number[]))
      await db
        .insert(familyChildrenTable)
        .values({ familyId: id, memberId: mId, type: "member" });
  }

  // Auto-delete family if fewer than 2 active members remain after the edit
  const stillExists = await db.select({ id: familiesTable.id }).from(familiesTable).where(eq(familiesTable.id, id)).limit(1);
  if (stillExists.length) await cleanupFamilyIfUndersized(id);

  // Re-fetch after potential auto-deletion
  const updated = await db
    .select()
    .from(familiesTable)
    .where(eq(familiesTable.id, id))
    .limit(1);

  // If auto-deleted, return dissolved response
  if (!updated.length) return res.json({ deleted: true, reason: "Family dissolved — only one member remained" });

  // Sync spouseId on members to keep records accurate
  const oldHeadId = fam[0].headId;
  const oldSpouseId = fam[0].spouseId;
  const finalHeadId = updated[0].headId;
  const finalSpouseId = updated[0].spouseId;

  // Clear spouseId on members who were swapped out
  if (fatherId !== undefined && oldHeadId && oldHeadId !== finalHeadId) {
    await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, oldHeadId));
  }
  if (motherId !== undefined && oldSpouseId && oldSpouseId !== finalSpouseId) {
    await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, oldSpouseId));
  }
  // Keep both adults' spouseId pointing to each other
  if (finalHeadId && finalSpouseId) {
    await db.update(membersTable).set({ spouseId: finalSpouseId, maritalStatus: "married" }).where(eq(membersTable.id, finalHeadId));
    await db.update(membersTable).set({ spouseId: finalHeadId, maritalStatus: "married" }).where(eq(membersTable.id, finalSpouseId));
  }

  res.json(await getFamilyDetail(updated[0]));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const fam = await db
    .select()
    .from(familiesTable)
    .where(eq(familiesTable.id, id))
    .limit(1);
  if (!fam.length) return res.status(404).json({ error: "Family not found" });
  res.json(await getFamilyDetail(fam[0]));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  // Rule 1: clear spouse links on member records when family is deleted
  const fam = await db.select().from(familiesTable).where(eq(familiesTable.id, id)).limit(1);
  if (fam.length) {
    if (fam[0].headId) {
      await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, fam[0].headId));
    }
    if (fam[0].spouseId) {
      await db.update(membersTable).set({ spouseId: null }).where(eq(membersTable.id, fam[0].spouseId));
    }
  }
  await db.delete(familyChildrenTable).where(eq(familyChildrenTable.familyId, id));
  await db.delete(familiesTable).where(eq(familiesTable.id, id));
  res.json({ success: true });
});

export default router;
