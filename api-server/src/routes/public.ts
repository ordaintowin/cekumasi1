import { Router } from "express";
import { db } from "@workspace/db";
import {
  membersTable, usersTable, activityLogTable,
  cellsTable, seniorCellsTable, pcfsTable,
  childrenTable, teensTable,
  familiesTable, familyChildrenTable,
} from "@workspace/db";
import { eq, and, ilike, or, ne, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

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

// ── Family helper — same logic as children.ts ──────────────────────────────
async function linkChildToParentFamily(
  parentId: number,
  childType: "child" | "teen",
  childEntityId: number
) {
  const prevFcCond = childType === "child"
    ? and(eq(familyChildrenTable.childId, childEntityId), eq(familyChildrenTable.type, "child"))
    : and(eq(familyChildrenTable.teenId, childEntityId), eq(familyChildrenTable.type, "teen"));
  const prevFc = await db.select().from(familyChildrenTable).where(prevFcCond).limit(1);

  let family: any = null;
  const asHead = await db.select().from(familiesTable).where(eq(familiesTable.headId, parentId)).limit(1);
  if (asHead.length) family = asHead[0];
  if (!family) {
    const asSpouse = await db.select().from(familiesTable).where(eq(familiesTable.spouseId, parentId)).limit(1);
    if (asSpouse.length) family = asSpouse[0];
  }

  if (!family) {
    const member = await db.select().from(membersTable).where(eq(membersTable.id, parentId)).limit(1);
    if (!member.length) return;
    const famData: any = member[0].gender === "male" ? { headId: parentId } : { spouseId: parentId };

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

  if (prevFc.length && prevFc[0].familyId !== family.id) {
    await db.delete(familyChildrenTable).where(prevFcCond);
  }

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

// GET /api/public/cells
router.get("/public/cells", async (_req, res) => {
  try {
    const cells = await db.select().from(cellsTable)
      .where(eq(cellsTable.isArchived, false))
      .orderBy(cellsTable.name);
    const enriched = await Promise.all(cells.map(async (c) => {
      let seniorCellName: string | null = null;
      let pcfName: string | null = null;
      if (c.seniorCellId) {
        const sc = await db.select().from(seniorCellsTable)
          .where(eq(seniorCellsTable.id, c.seniorCellId)).limit(1);
        if (sc.length) {
          seniorCellName = sc[0].name;
          if (sc[0].pcfId) {
            const pcf = await db.select().from(pcfsTable)
              .where(eq(pcfsTable.id, sc[0].pcfId)).limit(1);
            if (pcf.length) pcfName = pcf[0].name;
          }
        }
      }
      return { id: c.id, name: c.name, seniorCellName, pcfName };
    }));
    res.json(enriched);
  } catch {
    res.status(500).json({ error: "Failed to load cells" });
  }
});

// GET /api/public/members-search?q=...
router.get("/public/members-search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json([]);
  try {
    const results = await db.select({
      id: membersTable.id,
      firstName: membersTable.firstName,
      lastName: membersTable.lastName,
      membershipId: membersTable.membershipId,
    }).from(membersTable)
      .where(and(
        eq(membersTable.isArchived, false),
        or(
          ilike(membersTable.firstName, `%${q}%`),
          ilike(membersTable.lastName, `%${q}%`),
          ilike(membersTable.membershipId, `%${q}%`),
        )
      ))
      .limit(12);
    res.json(results);
  } catch {
    res.json([]);
  }
});

// POST /api/public/register/member
router.post("/public/register/member", async (req, res) => {
  try {
    const {
      firstName, lastName, gender, phone1, phone2, email, occupation,
      residentialAddress, emergencyContact, dateOfBirth, maritalStatus,
      dateJoined, foundationSchoolDate, weddingDate, isBaptized, cellId,
      title, profilePhoto, memberType, spouseId: rawSpouseId,
    } = req.body;

    if (!firstName || !lastName || !gender || !phone1) {
      return res.status(400).json({ error: "First name, last name, gender and phone are required." });
    }

    const resolvedType = (memberType === "visitor" ? "visitor" : "member") as "member" | "visitor";
    const selectedSpouseId = rawSpouseId ? parseInt(String(rawSpouseId), 10) : null;

    // Validate phone uniqueness
    const existing = await db.select().from(membersTable).where(
      and(
        or(eq(membersTable.phone1, phone1), eq(membersTable.phone2, phone1)),
        eq(membersTable.isArchived, false)
      )
    ).limit(1);
    if (existing.length) {
      const m = existing[0];
      return res.status(409).json({
        error: `Phone number already registered to ${m.firstName} ${m.lastName} (${m.membershipId}).`,
      });
    }

    // Validate spouse if provided — same rules as admin
    if (selectedSpouseId) {
      const spouseRecord = await db.select().from(membersTable)
        .where(and(eq(membersTable.id, selectedSpouseId), eq(membersTable.isArchived, false))).limit(1);
      if (!spouseRecord.length) {
        return res.status(400).json({ error: "Selected spouse not found." });
      }
      if (spouseRecord[0].gender === gender) {
        return res.status(400).json({ error: "Same-sex couples are not permitted." });
      }
      const usedAsSpouse = await db.select({ id: membersTable.id }).from(membersTable)
        .where(and(eq(membersTable.spouseId, selectedSpouseId), eq(membersTable.isArchived, false))).limit(1);
      if (usedAsSpouse.length) {
        return res.status(409).json({ error: "This person is already linked as a spouse to another member." });
      }
      if (spouseRecord[0].spouseId) {
        return res.status(409).json({ error: "This person already has a spouse linked to their profile." });
      }
    }

    const pin = generatePin();
    const membershipId = await generateMembershipId(firstName, lastName);

    const created = await db.insert(membersTable).values({
      membershipId,
      firstName, lastName, gender, phone1,
      phone2: phone2 || null,
      email: email || null,
      occupation: occupation || "",
      residentialAddress: residentialAddress || "",
      emergencyContact: emergencyContact || "",
      dateOfBirth: dateOfBirth || null,
      maritalStatus: maritalStatus || null,
      dateJoined: dateJoined || null,
      foundationSchoolDate: foundationSchoolDate || null,
      weddingDate: weddingDate || null,
      isBaptized: !!isBaptized,
      cellId: cellId ? parseInt(String(cellId), 10) : null,
      title: title || null,
      profilePhoto: profilePhoto || null,
      memberType: resolvedType,
      spouseId: selectedSpouseId,
      pin,
    }).returning();

    const newMemberId = created[0].id;

    // ── Spouse linking — same rules as admin POST /members ─────────────────
    if (selectedSpouseId && resolvedType === "member" && maritalStatus === "married") {
      // Bidirectional: update spouse's record to point back
      const spouseUpdates: Record<string, any> = { spouseId: newMemberId, maritalStatus: "married" };
      if (weddingDate) spouseUpdates.weddingDate = weddingDate;
      await db.update(membersTable).set(spouseUpdates).where(eq(membersTable.id, selectedSpouseId));

      // Family creation: fill existing partial family or create new one
      const spouseExistingFamily = await db.select().from(familiesTable)
        .where(or(eq(familiesTable.headId, selectedSpouseId), eq(familiesTable.spouseId, selectedSpouseId))).limit(1);

      if (spouseExistingFamily.length) {
        // Spouse already in a partial family — fill the empty slot
        const sf = spouseExistingFamily[0];
        if (gender === "male" && !sf.headId) {
          await db.update(familiesTable).set({ headId: newMemberId }).where(eq(familiesTable.id, sf.id));
        } else if (gender === "female" && !sf.spouseId) {
          await db.update(familiesTable).set({ spouseId: newMemberId }).where(eq(familiesTable.id, sf.id));
        }
      } else {
        // Neither in a family — create a new one
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

    await db.insert(activityLogTable).values({
      type: "new_member",
      description: `${resolvedType === "visitor" ? "Visitor" : "Member"} ${firstName} ${lastName} self-registered via public form`,
      memberId: newMemberId,
      memberName: `${firstName} ${lastName}`,
    });

    await db.insert(usersTable).values({
      username: membershipId,
      passwordHash: hashPassword(pin),
      roleLevel: 5,
      memberId: newMemberId,
    });

    res.status(201).json({ membershipId, pin, name: `${firstName} ${lastName}` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Registration failed" });
  }
});

// POST /api/public/register/child
router.post("/public/register/child", async (req, res) => {
  try {
    const { firstName, lastName, gender, dateOfBirth, class: childClass, parentId, parentExternal } = req.body;
    if (!firstName || !lastName || !childClass) {
      return res.status(400).json({ error: "First name, last name and class are required." });
    }

    const pid = parentId ? parseInt(String(parentId), 10) : null;
    const pext = parentExternal ? String(parentExternal).trim() : null;

    // Duplicate check: same child name + same parent
    if (pid || pext) {
      const orClauses: any[] = [];
      if (pid) orClauses.push(eq(childrenTable.parentId, pid));
      if (pext) orClauses.push(sql`LOWER(${childrenTable.parentExternal}) = LOWER(${pext})`);

      const dup = await db.select({ id: childrenTable.id }).from(childrenTable).where(
        and(
          eq(childrenTable.isArchived, false),
          sql`LOWER(${childrenTable.firstName}) = LOWER(${firstName})`,
          sql`LOWER(${childrenTable.lastName}) = LOWER(${lastName})`,
          or(...orClauses)
        )
      ).limit(1);

      if (dup.length) {
        return res.status(409).json({
          error: `${firstName} ${lastName} is already registered with this parent.`,
        });
      }
    }

    const created = await db.insert(childrenTable).values({
      firstName, lastName,
      gender: gender || null,
      dateOfBirth: dateOfBirth || null,
      class: childClass,
      parentId: pid,
      parentExternal: pext,
    }).returning();

    // ── Family linking — same as admin POST /children ──────────────────────
    if (pid) {
      await linkChildToParentFamily(pid, "child", created[0].id);
    }

    res.status(201).json({ id: created[0].id, firstName, lastName });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Registration failed" });
  }
});

// POST /api/public/register/teen
router.post("/public/register/teen", async (req, res) => {
  try {
    const {
      firstName, lastName, gender, phone1, phone2,
      residentialAddress, placeOfResidence,
      dateOfBirth, dateJoined, foundationSchoolDate, foundationSchoolCompleted,
      parentId, parentExternal,
    } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First name and last name are required." });
    }

    const pid = parentId ? parseInt(String(parentId), 10) : null;
    const pext = parentExternal ? String(parentExternal).trim() : null;

    // Duplicate check: same teen name + same parent
    if (pid || pext) {
      const orClauses: any[] = [];
      if (pid) orClauses.push(eq(teensTable.parentId, pid));
      if (pext) orClauses.push(sql`LOWER(${teensTable.parentExternal}) = LOWER(${pext})`);

      const dup = await db.select({ id: teensTable.id }).from(teensTable).where(
        and(
          eq(teensTable.isArchived, false),
          sql`LOWER(${teensTable.firstName}) = LOWER(${firstName})`,
          sql`LOWER(${teensTable.lastName}) = LOWER(${lastName})`,
          or(...orClauses)
        )
      ).limit(1);

      if (dup.length) {
        return res.status(409).json({
          error: `${firstName} ${lastName} is already registered with this parent.`,
        });
      }
    }

    const address = placeOfResidence || residentialAddress || null;

    const created = await db.insert(teensTable).values({
      firstName, lastName,
      gender: gender || null,
      phone1: phone1 || null,
      phone2: phone2 || null,
      residentialAddress: address,
      dateOfBirth: dateOfBirth || null,
      dateJoined: dateJoined || null,
      foundationSchoolDate: foundationSchoolDate || null,
      foundationSchoolCompleted: !!foundationSchoolCompleted,
      parentId: pid,
      parentExternal: pext,
    }).returning();

    // ── Family linking — same as admin POST /teens ─────────────────────────
    if (pid) {
      await linkChildToParentFamily(pid, "teen", created[0].id);
    }

    res.status(201).json({ id: created[0].id, firstName, lastName });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Registration failed" });
  }
});

export default router;
