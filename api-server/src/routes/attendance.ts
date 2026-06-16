import { Router } from "express";
import { db } from "@workspace/db";
import {
  servicesTable, attendanceRecordsTable, membersTable, firstTimersTable,
  activityLogTable, cellsTable, seniorCellsTable, pcfsTable,
  childrenTable, teensTable,
  serviceChildrenAttendanceTable, serviceTeensAttendanceTable,
  givingsTable,
} from "@workspace/db";
import { eq, and, ilike, or, sql, gte, lte, inArray, isNull, desc } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";

const router = Router();
router.use(authenticateToken);

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

function fmt(m: { title?: string | null; firstName: string; lastName: string }): string {
  return m.title ? `${m.title} ${m.firstName} ${m.lastName}` : `${m.firstName} ${m.lastName}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ─── SERVICES ────────────────────────────────────────────────────────────────

router.get("/services", async (req, res) => {
  const { page = "1", limit = "25" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;
  const services = await db.select().from(servicesTable).orderBy(servicesTable.id).limit(limitNum).offset(offset);
  const total = await db.select({ count: sql<number>`count(*)` }).from(servicesTable);
  const enriched = await Promise.all(services.map(async (s) => {
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable).where(eq(attendanceRecordsTable.serviceId, s.id));
    return { ...s, totalCheckins: Number(cnt[0].count) };
  }));
  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

router.post("/services", async (req, res) => {
  const { name, date, time, force } = req.body;
  if (!name || !date) return res.status(400).json({ error: "Name and date are required" });

  const open = await db.select().from(servicesTable).where(eq(servicesTable.status, "open")).limit(1);

  if (open.length && !force) {
    return res.status(409).json({
      error: "conflict",
      existingService: { id: open[0].id, name: open[0].name, date: open[0].date },
    });
  }
  if (open.length && force) {
    await db.update(servicesTable).set({ status: "closed", closedAt: new Date() }).where(eq(servicesTable.id, open[0].id));
  }

  const created = await db.insert(servicesTable)
    .values({ name, date, time: time || null, type: "onsite", status: "open" })
    .returning();

  res.status(201).json({ ...created[0], memberCount: 0, childrenCount: 0, teensCount: 0, firstTimerCount: 0, totalCount: 0 });
});

router.patch("/services/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const user = (req as any).user;
  if (user.roleLevel > 3) return res.status(403).json({ error: "Not authorized" });

  const { name, date, time } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (date !== undefined) updates.date = date;
  if (time !== undefined) updates.time = time || null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });

  const updated = await db.update(servicesTable).set(updates).where(eq(servicesTable.id, id)).returning();
  if (!updated.length) return res.status(404).json({ error: "Service not found" });

  const cnt = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable).where(eq(attendanceRecordsTable.serviceId, id));
  res.json({ ...updated[0], totalCheckins: Number(cnt[0].count) });
});

router.get("/services/active", async (req, res) => {
  const open = await db.select().from(servicesTable).where(eq(servicesTable.status, "open")).limit(1);
  if (!open.length) return res.json({ service: null });

  const svc = open[0];

  const [memberCnt, childrenCnt, teensCnt, firstTimerCnt, returningCnt] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable).where(eq(attendanceRecordsTable.serviceId, svc.id)),
    db.select({ count: sql<number>`count(*)` }).from(serviceChildrenAttendanceTable).where(eq(serviceChildrenAttendanceTable.serviceId, svc.id)),
    db.select({ count: sql<number>`count(*)` }).from(serviceTeensAttendanceTable).where(eq(serviceTeensAttendanceTable.serviceId, svc.id)),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable).where(and(eq(firstTimersTable.serviceId, svc.id), eq(firstTimersTable.isArchived, false), eq(firstTimersTable.isReturning, false))),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable).where(and(eq(firstTimersTable.serviceId, svc.id), eq(firstTimersTable.isArchived, false), eq(firstTimersTable.isReturning, true))),
  ]);

  const memberCount = Number(memberCnt[0].count) + Number(returningCnt[0].count);
  const childrenCount = Number(childrenCnt[0].count);
  const teensCount = Number(teensCnt[0].count);
  const firstTimerCount = Number(firstTimerCnt[0].count);

  res.json({
    service: {
      ...svc,
      memberCount,
      childrenCount,
      teensCount,
      firstTimerCount,
      totalCount: memberCount + childrenCount + teensCount + firstTimerCount,
    },
  });
});

router.get("/services/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const service = await db.select().from(servicesTable).where(eq(servicesTable.id, id)).limit(1);
  if (!service.length) return res.status(404).json({ error: "Service not found" });
  const cnt = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable).where(eq(attendanceRecordsTable.serviceId, id));
  res.json({ ...service[0], totalCheckins: Number(cnt[0].count) });
});

router.post("/services/:id/close", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(servicesTable).set({ status: "closed", closedAt: new Date() }).where(eq(servicesTable.id, id));
  res.json({ success: true });
});

router.post("/services/:id/checkin", async (req, res) => {
  const serviceId = parseInt(req.params.id);
  const { memberId, membershipId, method = "manual" } = req.body;

  let member: any = null;
  if (memberId) {
    const m = await db.select().from(membersTable).where(and(eq(membersTable.id, memberId), eq(membersTable.isArchived, false))).limit(1);
    if (m.length) member = m[0];
  } else if (membershipId) {
    const m = await db.select().from(membersTable).where(and(eq(membersTable.membershipId, membershipId), eq(membersTable.isArchived, false))).limit(1);
    if (m.length) member = m[0];
  }

  if (!member) return res.status(404).json({ error: "Member not found" });

  let cellName: string | null = null;
  if (member.cellId) {
    const cell = await db.select().from(cellsTable).where(eq(cellsTable.id, member.cellId)).limit(1);
    if (cell.length) cellName = cell[0].name;
  }

  const existing = await db.select().from(attendanceRecordsTable)
    .where(and(eq(attendanceRecordsTable.serviceId, serviceId), eq(attendanceRecordsTable.memberId, member.id)))
    .limit(1);

  if (existing.length) {
    return res.json({ success: true, member: { ...member, cellName, leadershipRoles: [] }, alreadyCheckedIn: true });
  }

  await db.insert(attendanceRecordsTable).values({ serviceId, memberId: member.id, cellId: member.cellId ?? null, method });
  await db.insert(activityLogTable).values({
    type: "checkin",
    description: `${fmt(member)} checked in`,
    memberId: member.id,
    memberName: fmt(member),
  });

  res.json({ success: true, member: { ...member, cellName, leadershipRoles: [] }, alreadyCheckedIn: false });
});

router.delete("/services/:id/checkin/:memberId", async (req, res) => {
  const serviceId = parseInt(req.params.id);
  const memberId  = parseInt(req.params.memberId);
  await db.delete(attendanceRecordsTable)
    .where(and(eq(attendanceRecordsTable.serviceId, serviceId), eq(attendanceRecordsTable.memberId, memberId)));
  res.json({ success: true });
});

router.post("/services/:id/register-child", async (req, res) => {
  const serviceId = parseInt(req.params.id);
  const { childId } = req.body;
  if (!childId) return res.status(400).json({ error: "childId required" });

  const child = await db.select().from(childrenTable).where(eq(childrenTable.id, childId)).limit(1);
  if (!child.length) return res.status(404).json({ error: "Child not found" });

  const existing = await db.select().from(serviceChildrenAttendanceTable)
    .where(and(eq(serviceChildrenAttendanceTable.serviceId, serviceId), eq(serviceChildrenAttendanceTable.childId, childId)))
    .limit(1);

  if (existing.length) return res.json({ success: true, child: child[0], alreadyRegistered: true });

  await db.insert(serviceChildrenAttendanceTable).values({ serviceId, childId });
  res.json({ success: true, child: child[0], alreadyRegistered: false });
});

router.post("/services/:id/register-teen", async (req, res) => {
  const serviceId = parseInt(req.params.id);
  const { teenId } = req.body;
  if (!teenId) return res.status(400).json({ error: "teenId required" });

  const teen = await db.select().from(teensTable).where(eq(teensTable.id, teenId)).limit(1);
  if (!teen.length) return res.status(404).json({ error: "Teen not found" });

  const existing = await db.select().from(serviceTeensAttendanceTable)
    .where(and(eq(serviceTeensAttendanceTable.serviceId, serviceId), eq(serviceTeensAttendanceTable.teenId, teenId)))
    .limit(1);

  if (existing.length) return res.json({ success: true, teen: teen[0], alreadyRegistered: true });

  await db.insert(serviceTeensAttendanceTable).values({ serviceId, teenId });
  res.json({ success: true, teen: teen[0], alreadyRegistered: false });
});

// ─── REMOVE CHILD/TEEN FROM SERVICE ───────────────────────────────────────────

router.delete("/services/:serviceId/register-child/:childId", async (req, res) => {
  const serviceId = parseInt(req.params.serviceId);
  const childId = parseInt(req.params.childId);
  await db.delete(serviceChildrenAttendanceTable)
    .where(and(eq(serviceChildrenAttendanceTable.serviceId, serviceId), eq(serviceChildrenAttendanceTable.childId, childId)));
  res.json({ success: true });
});

router.delete("/services/:serviceId/register-teen/:teenId", async (req, res) => {
  const serviceId = parseInt(req.params.serviceId);
  const teenId = parseInt(req.params.teenId);
  await db.delete(serviceTeensAttendanceTable)
    .where(and(eq(serviceTeensAttendanceTable.serviceId, serviceId), eq(serviceTeensAttendanceTable.teenId, teenId)));
  res.json({ success: true });
});

router.get("/services/:id/attendance", async (req, res) => {
  const serviceId = parseInt(req.params.id);

  const checkins = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.serviceId, serviceId));
  const checkedInIds = new Set(checkins.map(c => c.memberId));
  const checkinMap = new Map(checkins.map(c => [c.memberId, c]));

  // Count check-ins per cell using the cellId snapshotted at check-in time.
  // This ensures deleted or transferred members still count toward the cell they
  // belonged to when they actually attended.
  const checkinsByCellId = new Map<number, number>();
  for (const ci of checkins) {
    if (ci.cellId != null) {
      checkinsByCellId.set(ci.cellId, (checkinsByCellId.get(ci.cellId) ?? 0) + 1);
    }
  }

  // Active (non-archived) members only for the live roster display
  const allMembers = await db.select().from(membersTable).where(and(eq(membersTable.isArchived, false), eq(membersTable.memberType, "member")));
  const memberMap = new Map(allMembers.map(m => [m.id, m]));

  // Fetch first-timers for this service — include archived ones (they still attended);
  // only exclude registration errors (genuine mistakes)
  const firstTimers = await db.select().from(firstTimersTable)
    .where(and(eq(firstTimersTable.serviceId, serviceId), eq(firstTimersTable.isRegistrationError, false)));

  // Build hierarchy: PCF → Senior Cell → Cell
  const pcfs = await db.select().from(pcfsTable).where(eq(pcfsTable.isArchived, false));
  const hierarchy: any[] = [];
  const attendeeList: any[] = [];
  const processedCellIds = new Set<number>();

  for (const pcf of pcfs) {
    const scs = await db.select().from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.pcfId, pcf.id), eq(seniorCellsTable.isArchived, false)));
    let pcfCheckedIn = 0, pcfTotal = 0;
    const scNodes: any[] = [];

    for (const sc of scs) {
      const cells = await db.select().from(cellsTable)
        .where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
      let scCheckedIn = 0, scTotal = 0;
      const cellNodes: any[] = [];

      for (const cell of cells) {
        processedCellIds.add(cell.id);
        const cellMembers = allMembers.filter(m => m.cellId === cell.id);
        // Use snapshot-based count so deleted/transferred members are included
        const snapshotCheckedIn = checkinsByCellId.get(cell.id) ?? 0;
        scCheckedIn += snapshotCheckedIn;
        scTotal += cellMembers.length;

        const members = cellMembers.map(m => ({
          memberId: m.id,
          memberName: fmt(m),
          profilePhoto: m.profilePhoto,
          checkedIn: checkedInIds.has(m.id),
          checkInTime: checkinMap.get(m.id)?.checkInTime?.toISOString() || null,
          isLeader: m.id === cell.leaderId,
        }));
        members.sort((a, b) => (b.isLeader ? 1 : 0) - (a.isLeader ? 1 : 0));
        cellNodes.push({ id: cell.id, name: cell.name, checkedIn: snapshotCheckedIn, total: cellMembers.length, members });

        for (const m of cellMembers.filter(m => checkedInIds.has(m.id))) {
          const ci = checkinMap.get(m.id);
          attendeeList.push({
            type: "member", memberId: m.id, name: fmt(m), profilePhoto: m.profilePhoto,
            fellowship: cell.name, scName: sc.name, pcfName: pcf.name,
            checkInTime: ci?.checkInTime?.toISOString() || null,
          });
        }
      }

      pcfCheckedIn += scCheckedIn; pcfTotal += scTotal;
      scNodes.push({ id: sc.id, name: sc.name, checkedIn: scCheckedIn, total: scTotal, cells: cellNodes });
    }
    hierarchy.push({ id: pcf.id, name: pcf.name, checkedIn: pcfCheckedIn, total: pcfTotal, seniorCells: scNodes });
  }

  // Standalone cells (not in any SC/PCF)
  const standaloneCells = await db.select().from(cellsTable)
    .where(and(eq(cellsTable.isArchived, false), sql`senior_cell_id IS NULL`));
  const standaloneNodes: any[] = [];
  for (const cell of standaloneCells) {
    if (processedCellIds.has(cell.id)) continue;
    processedCellIds.add(cell.id);
    const cellMembers = allMembers.filter(m => m.cellId === cell.id);
    const snapshotCheckedIn = checkinsByCellId.get(cell.id) ?? 0;
    const members = cellMembers.map(m => ({
      memberId: m.id, memberName: fmt(m), profilePhoto: m.profilePhoto,
      checkedIn: checkedInIds.has(m.id),
      checkInTime: checkinMap.get(m.id)?.checkInTime?.toISOString() || null,
      isLeader: m.id === cell.leaderId,
    }));
    standaloneNodes.push({ id: cell.id, name: cell.name, checkedIn: snapshotCheckedIn, total: cellMembers.length, members });
    for (const m of cellMembers.filter(m => checkedInIds.has(m.id))) {
      const ci = checkinMap.get(m.id);
      attendeeList.push({
        type: "member", memberId: m.id, name: fmt(m), profilePhoto: m.profilePhoto,
        fellowship: cell.name, scName: null, pcfName: null,
        checkInTime: ci?.checkInTime?.toISOString() || null,
      });
    }
  }

  // Standalone senior cells (no PCF)
  const allStandaloneSCs = await db.select().from(seniorCellsTable)
    .where(and(eq(seniorCellsTable.isArchived, false), sql`pcf_id IS NULL`));
  const standaloneSCNodes: any[] = [];
  for (const sc of allStandaloneSCs) {
    const scCells = await db.select().from(cellsTable)
      .where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
    let scCheckedIn = 0, scTotal = 0;
    const cellNodes: any[] = [];
    for (const cell of scCells) {
      if (processedCellIds.has(cell.id)) continue;
      processedCellIds.add(cell.id);
      const cellMembers = allMembers.filter(m => m.cellId === cell.id);
      const snapshotCheckedIn = checkinsByCellId.get(cell.id) ?? 0;
      scCheckedIn += snapshotCheckedIn;
      scTotal += cellMembers.length;
      const members = cellMembers.map(m => ({
        memberId: m.id, memberName: fmt(m), profilePhoto: m.profilePhoto,
        checkedIn: checkedInIds.has(m.id),
        checkInTime: checkinMap.get(m.id)?.checkInTime?.toISOString() || null,
        isLeader: m.id === cell.leaderId,
      }));
      cellNodes.push({ id: cell.id, name: cell.name, checkedIn: snapshotCheckedIn, total: cellMembers.length, members });
      for (const m of cellMembers.filter(m => checkedInIds.has(m.id))) {
        const ci = checkinMap.get(m.id);
        attendeeList.push({
          type: "member", memberId: m.id, name: fmt(m), profilePhoto: m.profilePhoto,
          fellowship: cell.name, scName: sc.name, pcfName: null,
          checkInTime: ci?.checkInTime?.toISOString() || null,
        });
      }
    }
    if (cellNodes.length > 0) {
      standaloneSCNodes.push({ id: sc.id, name: sc.name, checkedIn: scCheckedIn, total: scTotal, cells: cellNodes });
    }
  }

  // Add first-timers to attendeeList with invited-by fellowship
  const allCells = await db.select().from(cellsTable).where(eq(cellsTable.isArchived, false));
  const cellNameMap = new Map(allCells.map(c => [c.id, c.name]));

  // Pre-fetch child and teen inviters in bulk
  const childInviterIds = firstTimers.map(ft => ft.invitedByChildId).filter((id): id is number => !!id);
  const teenInviterIds = firstTimers.map(ft => ft.invitedByTeenId).filter((id): id is number => !!id);
  const childInviterMap = new Map<number, any>();
  const teenInviterMap = new Map<number, any>();
  if (childInviterIds.length > 0) {
    const childRows = await db.select().from(childrenTable).where(inArray(childrenTable.id, childInviterIds));
    childRows.forEach(c => childInviterMap.set(c.id, c));
  }
  if (teenInviterIds.length > 0) {
    const teenRows = await db.select().from(teensTable).where(inArray(teensTable.id, teenInviterIds));
    teenRows.forEach(t => teenInviterMap.set(t.id, t));
  }

  for (const ft of firstTimers) {
    let fellowshipName: string | null = null;
    let invitedByName: string | null = null;

    if (ft.invitedById) {
      const inviter = memberMap.get(ft.invitedById);
      if (inviter?.cellId) fellowshipName = cellNameMap.get(inviter.cellId) || null;
      if (inviter) invitedByName = fmt(inviter);
    } else if (ft.invitedByChildId) {
      fellowshipName = "Children's";
      const child = childInviterMap.get(ft.invitedByChildId);
      if (child) invitedByName = `${child.firstName} ${child.lastName}`;
    } else if (ft.invitedByTeenId) {
      fellowshipName = "Teens";
      const teen = teenInviterMap.get(ft.invitedByTeenId);
      if (teen) invitedByName = `${teen.firstName} ${teen.lastName}`;
    }

    attendeeList.push({
      type: ft.isReturning ? "returning_first_timer" : "first_timer",
      ftId: ft.id,
      name: `${ft.firstName} ${ft.lastName}`,
      fellowship: fellowshipName,
      pcfName: null, scName: null,
      checkInTime: ft.createdAt?.toISOString() || null,
      invitedByName,
    });
  }

  // Add children registered for this service
  const childrenRecs = await db.select().from(serviceChildrenAttendanceTable)
    .where(eq(serviceChildrenAttendanceTable.serviceId, serviceId));
  const childrenList: any[] = [];
  if (childrenRecs.length > 0) {
    const childRows = await db.select().from(childrenTable)
      .where(inArray(childrenTable.id, childrenRecs.map(r => r.childId)));
    for (const child of childRows) {
      const rec = childrenRecs.find(r => r.childId === child.id);
      const entry = {
        type: "child", childId: child.id,
        name: `${child.firstName} ${child.lastName}`,
        fellowship: null, pcfName: null, scName: null,
        checkInTime: rec?.registeredAt?.toISOString() || null,
        class: child.class,
      };
      attendeeList.push(entry);
      childrenList.push(entry);
    }
  }

  // Add teens registered for this service
  const teensRecs = await db.select().from(serviceTeensAttendanceTable)
    .where(eq(serviceTeensAttendanceTable.serviceId, serviceId));
  const teensList: any[] = [];
  if (teensRecs.length > 0) {
    const teenRows = await db.select().from(teensTable)
      .where(inArray(teensTable.id, teensRecs.map(r => r.teenId)));
    for (const teen of teenRows) {
      const rec = teensRecs.find(r => r.teenId === teen.id);
      const entry = {
        type: "teen", teenId: teen.id,
        name: `${teen.firstName} ${teen.lastName}`,
        fellowship: null, pcfName: null, scName: null,
        checkInTime: rec?.registeredAt?.toISOString() || null,
      };
      attendeeList.push(entry);
      teensList.push(entry);
    }
  }

  // Add visitor-type members who checked in (no fellowship, counted under "No Fellowship")
  const visitorMembers = await db.select().from(membersTable)
    .where(and(eq(membersTable.isArchived, false), eq(membersTable.memberType, "visitor")));
  for (const v of visitorMembers) {
    if (checkedInIds.has(v.id)) {
      const ci = checkinMap.get(v.id);
      attendeeList.push({
        type: "visitor",
        memberId: v.id,
        name: fmt(v),
        profilePhoto: v.profilePhoto,
        fellowship: null, scName: null, pcfName: null,
        checkInTime: ci?.checkInTime?.toISOString() || null,
      });
    }
  }

  // Sort attendee list by check-in time
  attendeeList.sort((a, b) => {
    if (!a.checkInTime && !b.checkInTime) return 0;
    if (!a.checkInTime) return 1;
    if (!b.checkInTime) return -1;
    return new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime();
  });

  // Backward-compat byFellowship (flat cells)
  const byFellowship = [
    ...hierarchy.flatMap(pcf => pcf.seniorCells.flatMap((sc: any) => sc.cells.map((c: any) => ({ ...c, pcfName: pcf.name, scName: sc.name })))),
    ...standaloneNodes,
  ];

  res.json({
    serviceId,
    totalCheckins: checkins.length,
    totalMembers: allMembers.length,
    hierarchy,
    standaloneGroups: standaloneNodes,
    standaloneSeniorCells: standaloneSCNodes,
    byFellowship,
    attendeeList,
    childrenList,
    teensList,
  });
});

// ─── FIRST TIMERS ─────────────────────────────────────────────────────────────

router.get("/first-timers", async (req, res) => {
  const { search, serviceId, page = "1", limit = "25" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  // Always exclude returning-visit rows — they are attendance tracking records,
  // not distinct people. Showing them would cause duplicate names everywhere.
  let conditions: any[] = [eq(firstTimersTable.isArchived, false), eq(firstTimersTable.isReturning, false)];
  if (serviceId) conditions.push(eq(firstTimersTable.serviceId, parseInt(serviceId)));
  if (search) conditions.push(or(ilike(firstTimersTable.firstName, `%${search}%`), ilike(firstTimersTable.lastName, `%${search}%`)));

  const fts = await db.select().from(firstTimersTable).where(and(...conditions)).orderBy(firstTimersTable.createdAt).limit(limitNum).offset(offset);
  const total = await db.select({ count: sql<number>`count(*)` }).from(firstTimersTable).where(and(...conditions));

  const allCells = await db.select().from(cellsTable).where(eq(cellsTable.isArchived, false));
  const cellNameMap = new Map(allCells.map(c => [c.id, c.name]));

  const enriched = await Promise.all(fts.map(async (ft) => {
    const svc = await db.select().from(servicesTable).where(eq(servicesTable.id, ft.serviceId)).limit(1);
    let invitedByName = null;
    let invitedByFellowship = null;
    if (ft.invitedById) {
      const m = await db.select().from(membersTable).where(eq(membersTable.id, ft.invitedById)).limit(1);
      if (m.length) {
        invitedByName = fmt(m[0]);
        if (m[0].cellId) invitedByFellowship = cellNameMap.get(m[0].cellId) || null;
      }
    } else if (ft.invitedByChildId) {
      const c = await db.select().from(childrenTable).where(eq(childrenTable.id, ft.invitedByChildId)).limit(1);
      if (c.length) invitedByName = `${c[0].firstName} ${c[0].lastName} (Children's)`;
    } else if (ft.invitedByTeenId) {
      const t = await db.select().from(teensTable).where(eq(teensTable.id, ft.invitedByTeenId)).limit(1);
      if (t.length) invitedByName = `${t[0].firstName} ${t[0].lastName} (Teens)`;
    }
    return { ...ft, serviceName: svc.length ? svc[0].name : "Unknown", serviceDate: svc.length ? svc[0].date : null, invitedByName, invitedByFellowship };
  }));

  res.json({ data: enriched, total: Number(total[0].count), page: pageNum, limit: limitNum });
});

router.get("/first-timers/voided", async (req, res) => {
  const { search } = req.query as any;
  let conditions: any[] = [eq(firstTimersTable.isRegistrationError, true)];
  if (search) conditions.push(or(ilike(firstTimersTable.firstName, `%${search}%`), ilike(firstTimersTable.lastName, `%${search}%`)));

  const fts = await db.select().from(firstTimersTable)
    .where(and(...conditions))
    .orderBy(desc(firstTimersTable.archivedAt))
    .limit(100);

  const allCells = await db.select().from(cellsTable).where(eq(cellsTable.isArchived, false));
  const cellNameMap = new Map(allCells.map(c => [c.id, c.name]));

  const enriched = await Promise.all(fts.map(async (ft) => {
    const svc = await db.select().from(servicesTable).where(eq(servicesTable.id, ft.serviceId)).limit(1);
    let invitedByName = null;
    if (ft.invitedById) {
      const m = await db.select().from(membersTable).where(eq(membersTable.id, ft.invitedById)).limit(1);
      if (m.length) invitedByName = fmt(m[0]);
    }
    return { ...ft, serviceName: svc.length ? svc[0].name : "Unknown", serviceDate: svc.length ? svc[0].date : null, invitedByName };
  }));

  res.json({ data: enriched });
});

router.post("/first-timers/:id/restore", async (req, res) => {
  const id = parseInt(req.params.id);
  const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, id)).limit(1);
  if (!ft.length) return res.status(404).json({ error: "Record not found" });
  await db.update(firstTimersTable).set({
    isArchived: false,
    isRegistrationError: false,
    archiveReason: null,
    archivedAt: null,
    archivedBy: null,
  }).where(eq(firstTimersTable.id, id));
  res.json({ success: true });
});

router.get("/first-timers/check-name", async (req, res) => {
  const { firstName, lastName } = req.query as any;
  if (!firstName || !lastName) return res.json({ matches: [] });
  const matches = await db.select({
    id: firstTimersTable.id,
    firstName: firstTimersTable.firstName,
    lastName: firstTimersTable.lastName,
    contact: firstTimersTable.contact,
    serviceId: firstTimersTable.serviceId,
  })
    .from(firstTimersTable)
    .where(and(
      ilike(firstTimersTable.firstName, firstName.trim()),
      ilike(firstTimersTable.lastName, lastName.trim()),
      eq(firstTimersTable.isArchived, false),
      eq(firstTimersTable.isReturning, false),
      eq(firstTimersTable.isRegistrationError, false),
    ));
  res.json({ matches });
});

router.post("/first-timers", async (req, res) => {
  const { firstName, lastName, gender, contact, invitedById, invitedByChildId, invitedByTeenId, serviceId } = req.body;
  if (!firstName || !lastName || !gender || !serviceId) return res.status(400).json({ error: "First name, last name, gender, and service required" });

  if (contact) {
    const existing = await db.select().from(firstTimersTable).where(
      and(eq(firstTimersTable.contact, contact), eq(firstTimersTable.isArchived, false))
    ).limit(1);
    if (existing.length) {
      const ft = existing[0];
      return res.status(409).json({
        error: `This phone number is already registered to first timer ${ft.firstName} ${ft.lastName}. Two people cannot share the same phone number.`,
      });
    }
  }

  const created = await db.insert(firstTimersTable)
    .values({
      firstName, lastName, gender, contact,
      invitedById: invitedById || null,
      invitedByChildId: invitedByChildId || null,
      invitedByTeenId: invitedByTeenId || null,
      serviceId,
    })
    .returning();

  const svc = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  await db.insert(activityLogTable).values({ type: "first_timer", description: `First timer ${firstName} ${lastName} registered` });

  let invitedByFellowship = null;
  let invitedByName = null;
  if (invitedById) {
    const m = await db.select().from(membersTable).where(eq(membersTable.id, invitedById)).limit(1);
    if (m.length) {
      invitedByName = `${m[0].firstName} ${m[0].lastName}`;
      if (m[0].cellId) {
        const cell = await db.select().from(cellsTable).where(eq(cellsTable.id, m[0].cellId)).limit(1);
        if (cell.length) invitedByFellowship = cell[0].name;
      }
    }
  } else if (invitedByChildId) {
    const c = await db.select().from(childrenTable).where(eq(childrenTable.id, invitedByChildId)).limit(1);
    if (c.length) invitedByName = `${c[0].firstName} ${c[0].lastName} (Children's)`;
  } else if (invitedByTeenId) {
    const t = await db.select().from(teensTable).where(eq(teensTable.id, invitedByTeenId)).limit(1);
    if (t.length) invitedByName = `${t[0].firstName} ${t[0].lastName} (Teens)`;
  }

  res.status(201).json({
    ...created[0],
    serviceName: svc.length ? svc[0].name : "",
    serviceDate: svc.length ? svc[0].date : "",
    invitedByName,
    invitedByFellowship,
  });
});

router.delete("/first-timers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  const permanent = req.query.permanent === "true";
  const user = (req as any).user;
  if (!reason && !permanent) return res.status(400).json({ error: "Reason required" });
  if (permanent) {
    // Registration error (mistaken check-in): soft-archive with flag, keep in DB, hidden from all reports
    await db.update(firstTimersTable).set({
      isArchived: true,
      isRegistrationError: true,
      archiveReason: reason || "Registration error",
      archivedAt: new Date(),
      archivedBy: user?.id ?? null,
    }).where(eq(firstTimersTable.id, id));
  } else {
    // Normal archive with reason: stays visible in reports as "Removed"
    await db.update(firstTimersTable).set({ isArchived: true, isRegistrationError: false, archiveReason: reason, archivedAt: new Date(), archivedBy: user.id }).where(eq(firstTimersTable.id, id));
  }
  res.json({ success: true });
});

router.put("/first-timers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { firstName, lastName, gender, contact, residence, bornAgain, maritalStatus, prayerRequest } = req.body;
  const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, id)).limit(1);
  if (!ft.length) return res.status(404).json({ error: "First timer not found" });
  const updated = await db.update(firstTimersTable).set({
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
    ...(gender && { gender }),
    contact: contact ?? null,
    residence: residence ?? null,
    ...(bornAgain !== undefined && bornAgain !== null && { bornAgain }),
    maritalStatus: maritalStatus ?? null,
    prayerRequest: prayerRequest ?? null,
  }).where(eq(firstTimersTable.id, id)).returning();
  res.json(updated[0]);
});

router.post("/first-timers/:id/send-to-teens", async (req, res) => {
  const id = parseInt(req.params.id);
  const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, id)).limit(1);
  if (!ft.length) return res.status(404).json({ error: "First timer not found" });
  const teen = await db.insert(teensTable).values({
    firstName: ft[0].firstName, lastName: ft[0].lastName,
    gender: ft[0].gender ?? undefined,
    phone1: ft[0].contact ?? undefined,
    residentialAddress: ft[0].residence ?? undefined,
    dateJoined: new Date().toISOString().split("T")[0],
  }).returning();
  await db.update(firstTimersTable).set({ isArchived: true, archiveReason: "Sent to Teens Church" }).where(eq(firstTimersTable.id, id));
  res.json(teen[0]);
});

router.post("/first-timers/:id/send-to-children", async (req, res) => {
  const id = parseInt(req.params.id);
  const { class: childClass } = req.body;
  if (!childClass) return res.status(400).json({ error: "Class required" });
  const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, id)).limit(1);
  if (!ft.length) return res.status(404).json({ error: "First timer not found" });
  const child = await db.insert(childrenTable).values({
    firstName: ft[0].firstName, lastName: ft[0].lastName,
    gender: ft[0].gender ?? undefined,
    class: childClass,
  }).returning();
  await db.update(firstTimersTable).set({ isArchived: true, archiveReason: "Sent to Children's Church" }).where(eq(firstTimersTable.id, id));
  res.json(child[0]);
});

router.post("/first-timers/:id/convert", async (req, res) => {
  const id = parseInt(req.params.id);
  const { cellId, force } = req.body;
  if (!cellId) return res.status(400).json({ error: "Cell ID required" });
  const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, id)).limit(1);
  if (!ft.length) return res.status(404).json({ error: "First timer not found" });

  // Duplicate check: warn if a member with the same full name AND phone already exists
  if (!force) {
    const ftPhone = ft[0].contact?.trim();
    if (ftPhone) {
      const duplicate = await db.select({
        id: membersTable.id, firstName: membersTable.firstName, lastName: membersTable.lastName, phone1: membersTable.phone1,
      })
        .from(membersTable)
        .where(and(
          ilike(membersTable.firstName, ft[0].firstName),
          ilike(membersTable.lastName, ft[0].lastName),
          eq(membersTable.phone1, ftPhone),
          eq(membersTable.isArchived, false),
        ))
        .limit(1);
      if (duplicate.length) {
        return res.status(409).json({
          warning: true,
          message: `A member named ${duplicate[0].firstName} ${duplicate[0].lastName} with the same phone number (${ftPhone}) already exists.`,
          existingMember: duplicate[0],
        });
      }
    }
  }

  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const membershipId = await generateMembershipId(ft[0].firstName, ft[0].lastName, "member");
  const member = await db.insert(membersTable).values({
    membershipId, firstName: ft[0].firstName, lastName: ft[0].lastName, gender: ft[0].gender,
    phone1: ft[0].contact || "N/A", memberType: "member", cellId, pin,
    emergencyContact: "", occupation: "", residentialAddress: ft[0].residence || "",
  }).returning();

  await db.update(firstTimersTable).set({ isArchived: true, archiveReason: "Converted to member" }).where(eq(firstTimersTable.id, id));
  await (db as any).update(givingsTable).set({ memberId: member[0].id, firstTimerId: null }).where(eq((givingsTable as any).firstTimerId, id));
  res.json({ ...member[0], leadershipRoles: [] });
});

router.post("/first-timers/:id/convert-to-visitor", async (req, res) => {
  const id = parseInt(req.params.id);
  const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, id)).limit(1);
  if (!ft.length) return res.status(404).json({ error: "First timer not found" });

  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const membershipId = await generateMembershipId(ft[0].firstName, ft[0].lastName, "visitor");
  const member = await db.insert(membersTable).values({
    membershipId, firstName: ft[0].firstName, lastName: ft[0].lastName, gender: ft[0].gender,
    phone1: ft[0].contact || "N/A", memberType: "visitor", cellId: null as any, pin,
    emergencyContact: "", occupation: "", residentialAddress: ft[0].residence || "",
  }).returning();

  await db.update(firstTimersTable).set({ isArchived: true, archiveReason: "Converted to visitor" }).where(eq(firstTimersTable.id, id));
  await (db as any).update(givingsTable).set({ memberId: member[0].id, firstTimerId: null }).where(eq((givingsTable as any).firstTimerId, id));
  res.json({ ...member[0], leadershipRoles: [] });
});

router.post("/first-timers/:id/returning", async (req, res) => {
  const id = parseInt(req.params.id);
  const { serviceId } = req.body;
  if (!serviceId) return res.status(400).json({ error: "Service ID required" });

  const ft = await db.select().from(firstTimersTable).where(eq(firstTimersTable.id, id)).limit(1);
  if (!ft.length) return res.status(404).json({ error: "First timer not found" });

  // Block if they were originally registered for this SAME service (not a returning visit)
  if (ft[0].serviceId === serviceId) {
    return res.json({ success: true, alreadyRegistered: true });
  }

  // Block if they already have ANY registration (original or returning) for this service
  const alreadyForService = await db.select({ id: firstTimersTable.id })
    .from(firstTimersTable)
    .where(and(
      eq(firstTimersTable.firstName, ft[0].firstName),
      eq(firstTimersTable.lastName, ft[0].lastName),
      eq(firstTimersTable.serviceId, serviceId),
      eq(firstTimersTable.isArchived, false),
    ))
    .limit(1);

  if (alreadyForService.length) {
    return res.json({ success: true, alreadyRegistered: true });
  }

  // Insert a returning-visit row (isReturning: true) so this service's attendance counts it
  await db.insert(firstTimersTable).values({
    firstName: ft[0].firstName,
    lastName: ft[0].lastName,
    gender: ft[0].gender,
    contact: ft[0].contact,
    serviceId,
    invitedById: ft[0].invitedById,
    invitedByChildId: ft[0].invitedByChildId,
    invitedByTeenId: ft[0].invitedByTeenId,
    isReturning: true,
  });

  res.json({ success: true, alreadyRegistered: false });
});

// ─── REPORTS ──────────────────────────────────────────────────────────────────

router.get("/reports/monthly", async (req, res) => {
  const { year, month } = req.query as any;
  if (!year || !month) return res.status(400).json({ error: "Year and month required" });
  const y = parseInt(year);
  const m = parseInt(month);
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = `${y}-${String(m).padStart(2, "0")}-31`;

  const services = await db.select().from(servicesTable).where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)));
  const pcfs = await db.select().from(pcfsTable).where(eq(pcfsTable.isArchived, false));
  const pcfReports: any[] = [];

  for (const pcf of pcfs) {
    const scs = await db.select().from(seniorCellsTable).where(and(eq(seniorCellsTable.pcfId, pcf.id), eq(seniorCellsTable.isArchived, false)));
    const rows: any[] = [];
    for (const sc of scs) {
      const cells = await db.select().from(cellsTable).where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)));
      for (const cell of cells) {
        const cellMembers = await db.select().from(membersTable).where(and(eq(membersTable.cellId, cell.id), eq(membersTable.isArchived, false)));
        for (const member of cellMembers) {
          const serviceCounts = await Promise.all(services.map(async (svc) => {
            const attended = await db.select().from(attendanceRecordsTable).where(and(eq(attendanceRecordsTable.serviceId, svc.id), eq(attendanceRecordsTable.memberId, member.id))).limit(1);
            return attended.length > 0;
          }));
          rows.push({ memberId: member.id, memberName: fmt(member), isLeader: member.id === cell.leaderId, serviceCounts, total: serviceCounts.filter(Boolean).length });
        }
      }
    }
    pcfReports.push({ pcfId: pcf.id, pcfName: pcf.name, rows, subtotal: rows.reduce((a, r) => a + r.total, 0) });
  }

  res.json({ year: y, month: m, services, pcfReports });
});

router.get("/reports/overall", async (req, res) => {
  const { startDate, endDate } = req.query as any;
  if (!startDate || !endDate) return res.status(400).json({ error: "Start and end dates required" });
  const services = await db.select().from(servicesTable).where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)));
  const cells = await db.select().from(cellsTable).where(eq(cellsTable.isArchived, false));
  const fellowshipRows: any[] = [];

  for (const cell of cells) {
    const serviceCounts = await Promise.all(services.map(async (svc) => {
      const cellMembers = await db.select().from(membersTable).where(and(eq(membersTable.cellId, cell.id), eq(membersTable.isArchived, false)));
      const memberIds = cellMembers.map(m => m.id);
      if (!memberIds.length) return 0;
      const attended = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.serviceId, svc.id), sql`member_id = ANY(${memberIds})`));
      return Number(attended[0].count);
    }));
    fellowshipRows.push({ id: cell.id, name: cell.name, type: "cell", serviceCounts, total: serviceCounts.reduce((a, b) => a + b, 0) });
  }

  res.json({ startDate, endDate, services, fellowshipRows });
});

// ─── MEMBER ATTENDANCE REPORT (P/A grid) ─────────────────────────────────────

router.get("/reports/members-attendance", async (req, res) => {
  const { month, serviceId, cellId, seniorCellId, pcfId, search, page = "1", limit = "20" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 50);
  const offset = (pageNum - 1) * limitNum;

  let services: any[] = [];
  if (serviceId) {
    const svc = await db.select().from(servicesTable).where(eq(servicesTable.id, parseInt(serviceId))).limit(1);
    if (svc.length) services = svc;
  } else if (month) {
    const [y, m] = month.split("-");
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;
    services = await db.select().from(servicesTable)
      .where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)))
      .orderBy(servicesTable.date);
  } else {
    services = await db.select().from(servicesTable).orderBy(servicesTable.id).limit(4);
  }

  const memberConditions: any[] = [eq(membersTable.isArchived, false), eq(membersTable.memberType, "member")];
  if (cellId) memberConditions.push(eq(membersTable.cellId, parseInt(cellId)));
  if (seniorCellId) {
    const cellsInSC = await db.select({ id: cellsTable.id }).from(cellsTable)
      .where(and(eq(cellsTable.seniorCellId, parseInt(seniorCellId)), eq(cellsTable.isArchived, false)));
    const scCellIds = cellsInSC.map((c) => c.id);
    memberConditions.push(scCellIds.length > 0 ? inArray(membersTable.cellId, scCellIds) : sql`false`);
  }
  if (pcfId) {
    const scsInPCF = await db.select({ id: seniorCellsTable.id }).from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.pcfId, parseInt(pcfId)), eq(seniorCellsTable.isArchived, false)));
    const pcfScIds = scsInPCF.map((sc) => sc.id);
    if (pcfScIds.length > 0) {
      const cellsInPCF = await db.select({ id: cellsTable.id }).from(cellsTable)
        .where(and(inArray(cellsTable.seniorCellId, pcfScIds), eq(cellsTable.isArchived, false)));
      const pcfCellIds = cellsInPCF.map((c) => c.id);
      memberConditions.push(pcfCellIds.length > 0 ? inArray(membersTable.cellId, pcfCellIds) : sql`false`);
    } else {
      memberConditions.push(sql`false`);
    }
  }
  if (search) {
    memberConditions.push(or(
      ilike(membersTable.firstName, `%${search}%`),
      ilike(membersTable.lastName, `%${search}%`),
    ));
  }

  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(...memberConditions));
  const members = await db.select().from(membersTable)
    .where(and(...memberConditions))
    .orderBy(membersTable.firstName)
    .limit(limitNum).offset(offset);

  // Enrich with cell/fellowship info and attendance
  const allCells = await db.select().from(cellsTable).where(eq(cellsTable.isArchived, false));
  const allSCs = await db.select().from(seniorCellsTable).where(eq(seniorCellsTable.isArchived, false));
  const allPCFs = await db.select().from(pcfsTable).where(eq(pcfsTable.isArchived, false));
  const cellMap = new Map(allCells.map(c => [c.id, c]));
  const scMap = new Map(allSCs.map(sc => [sc.id, sc]));
  const pcfMap = new Map(allPCFs.map(p => [p.id, p]));

  const memberRows = await Promise.all(members.map(async (m) => {
    const cell = m.cellId ? cellMap.get(m.cellId) : null;
    const sc = cell?.seniorCellId ? scMap.get(cell.seniorCellId) : null;
    const pcf = sc?.pcfId ? pcfMap.get(sc.pcfId) : null;

    const cellLabel = [pcf?.name, sc?.name, cell?.name].filter(Boolean).join(" › ");

    const attendance: Record<number, boolean> = {};
    for (const svc of services) {
      const rec = await db.select({ id: attendanceRecordsTable.id })
        .from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.serviceId, svc.id), eq(attendanceRecordsTable.memberId, m.id)))
        .limit(1);
      attendance[svc.id] = rec.length > 0;
    }

    const attended = Object.values(attendance).filter(Boolean).length;
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      cellLabel,
      attendance,
      attended,
      total: services.length,
    };
  }));

  res.json({
    services: services.map(s => ({ id: s.id, name: s.name, date: s.date })),
    members: memberRows,
    total: Number(totalCount[0].count),
    page: pageNum,
    limit: limitNum,
  });
});

// ─── FELLOWSHIP ATTENDANCE REPORT ────────────────────────────────────────────

router.get("/reports/fellowship-attendance", async (req, res) => {
  const { month } = req.query as any;
  if (!month) return res.status(400).json({ error: "Month required (YYYY-MM)" });

  const [y, m] = month.split("-");
  const startDate = `${y}-${m.padStart(2, "0")}-01`;
  const endDate = `${y}-${m.padStart(2, "0")}-31`;

  const services = await db.select().from(servicesTable)
    .where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)))
    .orderBy(servicesTable.date);

  // ── Build inviter lookup maps (same logic as the live attendance page) ──
  const allMembersForFt = await db.select({ id: membersTable.id, cellId: membersTable.cellId })
    .from(membersTable).where(eq(membersTable.isArchived, false));
  const allCellsForFt = await db.select({ id: cellsTable.id, seniorCellId: cellsTable.seniorCellId })
    .from(cellsTable).where(eq(cellsTable.isArchived, false));
  const allSCsForFt = await db.select({ id: seniorCellsTable.id, pcfId: seniorCellsTable.pcfId })
    .from(seniorCellsTable).where(eq(seniorCellsTable.isArchived, false));

  const memberCellMap: Record<number, number | null> = {};
  for (const mm of allMembersForFt) memberCellMap[mm.id] = mm.cellId;
  const cellScMap: Record<number, number | null> = {};
  for (const c of allCellsForFt) cellScMap[c.id] = c.seniorCellId;
  const scPcfMap: Record<number, number | null> = {};
  for (const sc of allSCsForFt) scPcfMap[sc.id] = sc.pcfId;

  // ── Pre-compute FT attribution for all services (mirrors live attendance rules) ──
  // returningFtByCellId: returning first-timers count as members for inviter's cell
  // cellFtAtt: new FTs attributed to standalone cells (inviter's cell has no SC)
  const pcfFtAtt: Record<number, Record<number, number>> = {};
  const scFtAtt: Record<number, Record<number, number>> = {};
  const cellFtAtt: Record<number, Record<number, number>> = {};
  const returningFtByCellId: Record<number, Record<number, number>> = {};
  const ftNotInFellowshipCounts: Record<number, number> = {};
  const returningFtNoFellowshipCounts: Record<number, number> = {};
  const ftTotalCounts: Record<number, number> = {};
  const childrenFtCounts: Record<number, number> = {};
  const teensFtCounts: Record<number, number> = {};

  for (const svc of services) {
    const fts = await db.select({
      invitedById: firstTimersTable.invitedById,
      invitedByChildId: firstTimersTable.invitedByChildId,
      invitedByTeenId: firstTimersTable.invitedByTeenId,
      isReturning: firstTimersTable.isReturning,
    })
      .from(firstTimersTable)
      .where(and(eq(firstTimersTable.serviceId, svc.id), eq(firstTimersTable.isRegistrationError, false)));

    let newFtCount = 0;

    for (const ft of fts) {
      let pcfId: number | null = null;
      let scId: number | null = null;
      let inviterCellId: number | null = null;

      if (ft.invitedByChildId) {
        if (!ft.isReturning) childrenFtCounts[svc.id] = (childrenFtCounts[svc.id] || 0) + 1;
      } else if (ft.invitedByTeenId) {
        if (!ft.isReturning) teensFtCounts[svc.id] = (teensFtCounts[svc.id] || 0) + 1;
      } else if (ft.invitedById) {
        inviterCellId = memberCellMap[ft.invitedById] ?? null;
        if (inviterCellId) {
          scId = cellScMap[inviterCellId] ?? null;
          if (scId) pcfId = scPcfMap[scId] ?? null;
        }
      }

      if (ft.isReturning) {
        // Returning first-timers count as members for the inviter's cell (same rule as live attendance table)
        if (inviterCellId) {
          if (!returningFtByCellId[inviterCellId]) returningFtByCellId[inviterCellId] = {};
          returningFtByCellId[inviterCellId][svc.id] = (returningFtByCellId[inviterCellId][svc.id] || 0) + 1;
        } else if (!ft.invitedByChildId && !ft.invitedByTeenId) {
          // Returning FT with no fellowship attribution → counts as member under No Fellowship
          returningFtNoFellowshipCounts[svc.id] = (returningFtNoFellowshipCounts[svc.id] || 0) + 1;
        }
        continue;
      }

      // New first-timer attribution
      newFtCount++;

      if (pcfId) {
        if (!pcfFtAtt[pcfId]) pcfFtAtt[pcfId] = {};
        pcfFtAtt[pcfId][svc.id] = (pcfFtAtt[pcfId][svc.id] || 0) + 1;
      }
      if (scId) {
        if (!scFtAtt[scId]) scFtAtt[scId] = {};
        scFtAtt[scId][svc.id] = (scFtAtt[scId][svc.id] || 0) + 1;
      }
      // FT whose inviter is in a standalone cell (cell with no SC) — attribute to that cell
      if (!scId && inviterCellId) {
        if (!cellFtAtt[inviterCellId]) cellFtAtt[inviterCellId] = {};
        cellFtAtt[inviterCellId][svc.id] = (cellFtAtt[inviterCellId][svc.id] || 0) + 1;
      }
      // No attribution at any level and not from children/teens
      if (!pcfId && !scId && !inviterCellId && !ft.invitedByChildId && !ft.invitedByTeenId) {
        ftNotInFellowshipCounts[svc.id] = (ftNotInFellowshipCounts[svc.id] || 0) + 1;
      }
    }

    ftTotalCounts[svc.id] = newFtCount;
  }

  // ── Build PCF / SC / Cell nodes (members = checkedIn + returning FTs, same as live table) ──
  const pcfs = await db.select().from(pcfsTable).where(eq(pcfsTable.isArchived, false)).orderBy(pcfsTable.name);
  const result: any[] = [];

  for (const pcf of pcfs) {
    const scs = await db.select().from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.pcfId, pcf.id), eq(seniorCellsTable.isArchived, false)))
      .orderBy(seniorCellsTable.name);

    const pcfAtt: Record<number, number> = {};
    const scNodes: any[] = [];

    for (const sc of scs) {
      const cells = await db.select().from(cellsTable)
        .where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)))
        .orderBy(cellsTable.name);

      const scAtt: Record<number, number> = {};
      const cellNodes: any[] = [];

      for (const cell of cells) {
        // Active member count (roster size — excludes archived/deleted members)
        const activeMemberCount = await db.select({ count: sql<number>`count(*)` })
          .from(membersTable)
          .where(and(eq(membersTable.cellId, cell.id), eq(membersTable.isArchived, false)));
        const memberCount = Number(activeMemberCount[0].count);

        const cellAtt: Record<number, number> = {};
        for (const svc of services) {
          // Count using cellId snapshot so deleted/transferred members are included
          const cnt = await db.select({ count: sql<number>`count(*)` })
            .from(attendanceRecordsTable)
            .where(and(eq(attendanceRecordsTable.serviceId, svc.id), eq(attendanceRecordsTable.cellId, cell.id)));
          let count = Number(cnt[0].count);
          // Add returning FTs as members (same rule as live attendance table)
          count += returningFtByCellId[cell.id]?.[svc.id] ?? 0;
          cellAtt[svc.id] = count;
          scAtt[svc.id] = (scAtt[svc.id] || 0) + count;
          pcfAtt[svc.id] = (pcfAtt[svc.id] || 0) + count;
        }
        cellNodes.push({ id: cell.id, name: cell.name, serviceAttendance: cellAtt, memberCount });
      }
      scNodes.push({ id: sc.id, name: sc.name, serviceAttendance: scAtt, cells: cellNodes });
    }
    result.push({ id: pcf.id, name: pcf.name, serviceAttendance: pcfAtt, seniorCells: scNodes });
  }

  const teensCounts: Record<number, number> = {};
  const childrenCounts: Record<number, number> = {};

  for (const svc of services) {
    const [teensCnt, childrenCnt] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(serviceTeensAttendanceTable)
        .where(eq(serviceTeensAttendanceTable.serviceId, svc.id)),
      db.select({ count: sql<number>`count(*)` })
        .from(serviceChildrenAttendanceTable)
        .where(eq(serviceChildrenAttendanceTable.serviceId, svc.id)),
    ]);
    teensCounts[svc.id] = Number(teensCnt[0].count);
    childrenCounts[svc.id] = Number(childrenCnt[0].count);
  }

  // Count visitors (members with memberType="visitor") who checked in for each service
  const visitorMemberIds = await db.select({ id: membersTable.id })
    .from(membersTable)
    .where(and(eq(membersTable.isArchived, false), eq(membersTable.memberType as any, "visitor")));
  const vIds = visitorMemberIds.map(m => m.id);
  const visitorCounts: Record<number, number> = {};
  for (const svc of services) {
    if (vIds.length) {
      const cnt = await db.select({ count: sql<number>`count(*)` })
        .from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.serviceId, svc.id), inArray(attendanceRecordsTable.memberId, vIds)));
      visitorCounts[svc.id] = Number(cnt[0].count);
    } else {
      visitorCounts[svc.id] = 0;
    }
  }

  // Attach ftServiceAttendance to each PCF/SC in result
  for (const pcf of result) {
    pcf.ftServiceAttendance = pcfFtAtt[pcf.id] ?? {};
    for (const sc of pcf.seniorCells ?? []) {
      sc.ftServiceAttendance = scFtAtt[sc.id] ?? {};
    }
  }

  // ── Standalone Senior Cells (no PCF) ──
  const standaloneSCsRaw = await db.select().from(seniorCellsTable)
    .where(and(isNull(seniorCellsTable.pcfId), eq(seniorCellsTable.isArchived, false)))
    .orderBy(seniorCellsTable.name);
  const standaloneSCNodes: any[] = [];
  for (const sc of standaloneSCsRaw) {
    const scCells = await db.select().from(cellsTable)
      .where(and(eq(cellsTable.seniorCellId, sc.id), eq(cellsTable.isArchived, false)))
      .orderBy(cellsTable.name);
    const scAtt: Record<number, number> = {};
    const scCellNodes: any[] = [];
    for (const cell of scCells) {
      const activeMems = await db.select({ count: sql<number>`count(*)` }).from(membersTable)
        .where(and(eq(membersTable.cellId, cell.id), eq(membersTable.isArchived, false)));
      const memberCount = Number(activeMems[0].count);
      const cAtt: Record<number, number> = {};
      for (const svc of services) {
        const r = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable)
          .where(and(eq(attendanceRecordsTable.serviceId, svc.id), eq(attendanceRecordsTable.cellId, cell.id)));
        let cnt = Number(r[0].count);
        cnt += returningFtByCellId[cell.id]?.[svc.id] ?? 0;
        cAtt[svc.id] = cnt;
        scAtt[svc.id] = (scAtt[svc.id] || 0) + cnt;
      }
      scCellNodes.push({ id: cell.id, name: cell.name, serviceAttendance: cAtt, memberCount });
    }
    standaloneSCNodes.push({ id: sc.id, name: sc.name, serviceAttendance: scAtt, ftServiceAttendance: scFtAtt[sc.id] ?? {}, cells: scCellNodes });
  }

  // ── Standalone Cells (no SC) ──
  const standaloneCellsRaw = await db.select().from(cellsTable)
    .where(and(isNull(cellsTable.seniorCellId), eq(cellsTable.isArchived, false)))
    .orderBy(cellsTable.name);
  const standaloneCellNodes: any[] = [];
  for (const cell of standaloneCellsRaw) {
    const activeMems = await db.select({ count: sql<number>`count(*)` }).from(membersTable)
      .where(and(eq(membersTable.cellId, cell.id), eq(membersTable.isArchived, false)));
    const memberCount = Number(activeMems[0].count);
    const cAtt: Record<number, number> = {};
    for (const svc of services) {
      const r = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.serviceId, svc.id), eq(attendanceRecordsTable.cellId, cell.id)));
      let cnt = Number(r[0].count);
      cnt += returningFtByCellId[cell.id]?.[svc.id] ?? 0;
      cAtt[svc.id] = cnt;
    }
    // Standalone cells can also have FT attribution (inviter in this cell, no SC above it)
    standaloneCellNodes.push({ id: cell.id, name: cell.name, serviceAttendance: cAtt, ftServiceAttendance: cellFtAtt[cell.id] ?? {}, memberCount });
  }

  res.json({
    month,
    services: services.map(s => ({
      id: s.id,
      name: s.name,
      date: s.date,
      firstTimerCount: ftTotalCounts[s.id] || 0,
      ftNotInFellowshipCount: ftNotInFellowshipCounts[s.id] || 0,
      returningFtNoFellowshipCount: returningFtNoFellowshipCounts[s.id] || 0,
      teensCount: teensCounts[s.id] || 0,
      childrenCount: childrenCounts[s.id] || 0,
      childrenFtCount: childrenFtCounts[s.id] || 0,
      teensFtCount: teensFtCounts[s.id] || 0,
      visitorCount: visitorCounts[s.id] || 0,
    })),
    pcfs: result,
    standaloneSeniorCells: standaloneSCNodes,
    standaloneCells: standaloneCellNodes,
  });
});

// ─── FIRST-TIMERS STATUS REPORT ────────────────────────────────────────────────

router.get("/reports/first-timers-status", async (req, res) => {
  const { search, page = "1", limit = "20", startDate, endDate } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 50);
  const offset = (pageNum - 1) * limitNum;

  // Show ALL first timers (including converted) — only exclude returning visits and registration errors
  const conditions: any[] = [eq(firstTimersTable.isReturning, false), eq(firstTimersTable.isRegistrationError, false)];
  if (search) {
    conditions.push(or(
      ilike(firstTimersTable.firstName, `%${search}%`),
      ilike(firstTimersTable.lastName, `%${search}%`),
    ));
  }

  // If date range provided, filter by service date
  if (startDate || endDate) {
    const serviceConditions: any[] = [];
    if (startDate) serviceConditions.push(gte(servicesTable.date, startDate));
    if (endDate) serviceConditions.push(lte(servicesTable.date, endDate));
    const servicesInRange = await db.select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(...serviceConditions));
    const serviceIds = servicesInRange.map(s => s.id);
    if (serviceIds.length === 0) {
      return res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
    }
    conditions.push(inArray(firstTimersTable.serviceId, serviceIds));
  }

  const totalRows = await db.select({ count: sql<number>`count(*)` }).from(firstTimersTable).where(and(...conditions));
  const fts = await db.select().from(firstTimersTable).where(and(...conditions))
    .orderBy(firstTimersTable.createdAt)
    .limit(limitNum).offset(offset);

  // Pre-load members (including archived so we can check converted ones)
  const allMembers = await db.select({
    id: membersTable.id, phone1: membersTable.phone1,
    firstName: membersTable.firstName, lastName: membersTable.lastName,
    cellId: membersTable.cellId,
  }).from(membersTable);
  const allTeens = await db.select({ id: teensTable.id, phone1: teensTable.phone1, firstName: teensTable.firstName, lastName: teensTable.lastName }).from(teensTable).where(eq(teensTable.isArchived, false));
  const allCells = await db.select({ id: cellsTable.id, name: cellsTable.name }).from(cellsTable);
  const cellMap = new Map(allCells.map(c => [c.id, c.name]));

  // Pre-load all services for visit date lookup
  const allServicesForStatus = await db.select({ id: servicesTable.id, name: servicesTable.name, date: servicesTable.date }).from(servicesTable);
  const svcMapForStatus = new Map(allServicesForStatus.map(s => [s.id, s]));

  const enriched = await Promise.all(fts.map(async (ft) => {
    // Count all visits (original + returning) — include serviceId for timeline
    const returningVisits = await db.select({ id: firstTimersTable.id, serviceId: firstTimersTable.serviceId })
      .from(firstTimersTable)
      .where(and(
        eq(firstTimersTable.isReturning, true),
        ft.contact
          ? eq(firstTimersTable.contact, ft.contact)
          : and(ilike(firstTimersTable.firstName, ft.firstName), ilike(firstTimersTable.lastName, ft.lastName)),
      ))
      .orderBy(firstTimersTable.createdAt);
    const visitCount = 1 + returningVisits.length;

    // Determine status
    let status = "Active First-Timer";
    let convertedTo: string | null = null;
    let movedToDetail: string | null = null;

    // Check archive reason (most reliable)
    const archivedVersion = ft.isArchived ? ft : await db.select({ id: firstTimersTable.id, archiveReason: firstTimersTable.archiveReason })
      .from(firstTimersTable)
      .where(and(
        eq(firstTimersTable.isArchived, true),
        ft.contact
          ? eq(firstTimersTable.contact, ft.contact)
          : and(ilike(firstTimersTable.firstName, ft.firstName), ilike(firstTimersTable.lastName, ft.lastName)),
      )).limit(1).then(r => r[0] ?? null);

    const archiveReason = (archivedVersion as any)?.archiveReason ?? "";

    if (archiveReason) {
      if (archiveReason.toLowerCase().includes("member")) {
        status = "Added as Member";
        convertedTo = "member";
        // Find the member record to get cell name
        const matchingMember = ft.contact
          ? allMembers.find(mm => mm.phone1 === ft.contact)
          : allMembers.find(mm => mm.firstName.toLowerCase() === ft.firstName.toLowerCase() && mm.lastName.toLowerCase() === ft.lastName.toLowerCase());
        if (matchingMember?.cellId) {
          const cellName = cellMap.get(matchingMember.cellId);
          movedToDetail = cellName ? `Member → ${cellName}` : "Member";
        } else {
          movedToDetail = "Member";
        }
      } else if (archiveReason.toLowerCase().includes("teen")) {
        status = "Added to Teens Church";
        convertedTo = "teen";
        movedToDetail = "Teens Church";
      } else if (archiveReason.toLowerCase().includes("children")) {
        status = "Added to Children's Church";
        convertedTo = "child";
        movedToDetail = "Children's Church";
      } else if (archiveReason.toLowerCase().includes("visitor")) {
        status = "Added as Visitor";
        convertedTo = "visitor";
        movedToDetail = "Visitor";
      } else {
        status = "Removed";
        movedToDetail = null;
      }
    } else if (!ft.isArchived && ft.contact) {
      // Fallback: match by phone
      const matchingMember = allMembers.find(mm => mm.phone1 === ft.contact && !mm.isArchived);
      if (matchingMember) {
        status = "Added as Member";
        convertedTo = "member";
        const cellName = matchingMember.cellId ? cellMap.get(matchingMember.cellId) : null;
        movedToDetail = cellName ? `Member → ${cellName}` : "Member";
      } else {
        const matchingTeen = allTeens.find(t => t.phone1 === ft.contact);
        if (matchingTeen) { status = "Added to Teens Church"; convertedTo = "teen"; movedToDetail = "Teens Church"; }
      }
    }

    const firstSvc = svcMapForStatus.get(ft.serviceId);

    // Build visit timeline using pre-loaded services map
    const visitDates = [
      { visit: 1, isReturning: false, date: firstSvc?.date ?? null, serviceName: firstSvc?.name ?? null },
      ...returningVisits.map((rv, i) => {
        const rvSvc = svcMapForStatus.get(rv.serviceId);
        return { visit: i + 2, isReturning: true, date: rvSvc?.date ?? null, serviceName: rvSvc?.name ?? null };
      }),
    ];

    return {
      id: ft.id,
      firstName: ft.firstName,
      lastName: ft.lastName,
      gender: ft.gender,
      contact: ft.contact,
      visitCount,
      status,
      convertedTo,
      movedToDetail,
      archiveReason: status === "Removed" ? archiveReason : null,
      visitDates,
      firstVisitDate: firstSvc?.date ?? null,
      firstVisitService: firstSvc?.name ?? null,
      createdAt: ft.createdAt,
    };
  }));

  // Compute summary stats across the full dataset (not just this page)
  const allFtsForStats = await db.select({ isArchived: firstTimersTable.isArchived, archiveReason: firstTimersTable.archiveReason })
    .from(firstTimersTable).where(and(...conditions.filter(c => c !== conditions[conditions.length - 1] || !startDate && !endDate)));

  // Simpler approach: compute from enriched + full count
  const statsConditions = [eq(firstTimersTable.isReturning, false), eq(firstTimersTable.isRegistrationError, false)];
  if (startDate || endDate) {
    const serviceConditions2: any[] = [];
    if (startDate) serviceConditions2.push(gte(servicesTable.date, startDate));
    if (endDate) serviceConditions2.push(lte(servicesTable.date, endDate));
    const svcIds = await db.select({ id: servicesTable.id }).from(servicesTable).where(and(...serviceConditions2));
    if (svcIds.length) statsConditions.push(inArray(firstTimersTable.serviceId, svcIds.map(s => s.id)));
  }
  if (search) {
    statsConditions.push(or(
      ilike(firstTimersTable.firstName, `%${search}%`),
      ilike(firstTimersTable.lastName, `%${search}%`),
    ));
  }

  const [memberCount, teensCount, childrenCount, visitorCount, activeCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable)
      .where(and(...statsConditions, eq(firstTimersTable.isArchived, true), ilike(firstTimersTable.archiveReason ?? sql`''`, "%member%"))),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable)
      .where(and(...statsConditions, eq(firstTimersTable.isArchived, true), ilike(firstTimersTable.archiveReason ?? sql`''`, "%teen%"))),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable)
      .where(and(...statsConditions, eq(firstTimersTable.isArchived, true), ilike(firstTimersTable.archiveReason ?? sql`''`, "%children%"))),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable)
      .where(and(...statsConditions, eq(firstTimersTable.isArchived, true), ilike(firstTimersTable.archiveReason ?? sql`''`, "%visitor%"))),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable)
      .where(and(...statsConditions, eq(firstTimersTable.isArchived, false))),
  ]);

  const mc = Number(memberCount[0].count);
  const tc = Number(teensCount[0].count);
  const cc = Number(childrenCount[0].count);
  const vc = Number(visitorCount[0].count);
  const sc = Number(activeCount[0].count);
  const establishedCount = mc + tc + cc;
  const grandTotal = Number(totalRows[0].count);
  const rc = grandTotal - sc - establishedCount - vc;

  res.json({
    data: enriched,
    total: grandTotal,
    established: establishedCount,
    asMember: mc,
    asTeens: tc,
    asChildren: cc,
    asVisitor: vc,
    removed: Math.max(0, rc),
    stillActive: sc,
    page: pageNum,
    limit: limitNum,
  });
});

// ─── ATTENDANCE TREND (graph data) ───────────────────────────────────────────

router.get("/reports/attendance-trend", async (req, res) => {
  const { view = "month", month, year, pcfId, seniorCellId, cellId, group } = req.query as any;

  // Special group: teens or children
  if (group === "teens" || group === "children") {
    const tbl = group === "teens" ? serviceTeensAttendanceTable : serviceChildrenAttendanceTable;
    const idCol = group === "teens" ? (serviceTeensAttendanceTable as any).teenId : (serviceChildrenAttendanceTable as any).childId;

    if (view === "month") {
      const m = month || new Date().toISOString().slice(0, 7);
      const [y, mo] = m.split("-");
      const startDate = `${y}-${mo.padStart(2, "0")}-01`;
      const endDate = `${y}-${mo.padStart(2, "0")}-31`;
      const services = await db.select().from(servicesTable)
        .where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)))
        .orderBy(servicesTable.date);
      const dataPoints = await Promise.all(services.map(async (svc) => {
        const cnt = await db.select({ count: sql<number>`count(*)` }).from(tbl)
          .where(eq((tbl as any).serviceId, svc.id));
        return {
          label: svc.date ? new Date(svc.date + "T00:00:00").toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" }) : svc.name,
          serviceName: svc.name, date: svc.date, total: Number(cnt[0].count),
        };
      }));
      return res.json({ view: "month", month: m, dataPoints });
    }
    const y = year || String(new Date().getFullYear());
    const maxMonth = parseInt(y) === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dataPoints = await Promise.all(Array.from({ length: maxMonth }, (_, i) => i + 1).map(async (mo) => {
      const startDate = `${y}-${String(mo).padStart(2, "0")}-01`;
      const endDate = `${y}-${String(mo).padStart(2, "0")}-31`;
      const svcs = await db.select({ id: servicesTable.id }).from(servicesTable)
        .where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)));
      let count = 0;
      if (svcs.length) {
        const cnt = await db.select({ count: sql<number>`count(*)` }).from(tbl)
          .where(inArray((tbl as any).serviceId, svcs.map(s => s.id)));
        count = Number(cnt[0].count);
      }
      const avg = svcs.length > 0 ? Math.round(count / svcs.length) : 0;
      return { label: MONTHS[mo - 1], month: `${y}-${String(mo).padStart(2, "0")}`, total: avg };
    }));
    return res.json({ view: "year", year: y, dataPoints });
  }

  // Resolve member IDs for fellowship filter
  let memberIds: number[] | null = null;

  if (cellId) {
    const ms = await db.select({ id: membersTable.id }).from(membersTable)
      .where(and(eq(membersTable.cellId, parseInt(cellId)), eq(membersTable.isArchived, false)));
    memberIds = ms.map(m => m.id);
  } else if (seniorCellId) {
    const cells = await db.select({ id: cellsTable.id }).from(cellsTable)
      .where(and(eq(cellsTable.seniorCellId, parseInt(seniorCellId)), eq(cellsTable.isArchived, false)));
    const cids = cells.map(c => c.id);
    if (cids.length) {
      const ms = await db.select({ id: membersTable.id }).from(membersTable)
        .where(and(inArray(membersTable.cellId, cids), eq(membersTable.isArchived, false)));
      memberIds = ms.map(m => m.id);
    } else {
      memberIds = [];
    }
  } else if (pcfId) {
    const scs = await db.select({ id: seniorCellsTable.id }).from(seniorCellsTable)
      .where(and(eq(seniorCellsTable.pcfId, parseInt(pcfId)), eq(seniorCellsTable.isArchived, false)));
    const scids = scs.map(sc => sc.id);
    if (scids.length) {
      const cells = await db.select({ id: cellsTable.id }).from(cellsTable)
        .where(and(inArray(cellsTable.seniorCellId, scids), eq(cellsTable.isArchived, false)));
      const cids = cells.map(c => c.id);
      if (cids.length) {
        const ms = await db.select({ id: membersTable.id }).from(membersTable)
          .where(and(inArray(membersTable.cellId, cids), eq(membersTable.isArchived, false)));
        memberIds = ms.map(m => m.id);
      } else {
        memberIds = [];
      }
    } else {
      memberIds = [];
    }
  }

  async function countAttendance(serviceIds: number[]): Promise<number> {
    if (!serviceIds.length) return 0;
    if (memberIds !== null) {
      if (!memberIds.length) return 0;
      const cnt = await db.select({ count: sql<number>`count(*)` })
        .from(attendanceRecordsTable)
        .where(and(inArray(attendanceRecordsTable.serviceId, serviceIds), inArray(attendanceRecordsTable.memberId, memberIds)));
      return Number(cnt[0].count);
    }
    const cnt = await db.select({ count: sql<number>`count(*)` })
      .from(attendanceRecordsTable)
      .where(inArray(attendanceRecordsTable.serviceId, serviceIds));
    return Number(cnt[0].count);
  }

  // Helper: when no fellowship filter, add FTs + returning FTs + teens + children to the member count
  async function countFullAttendance(serviceIds: number[]): Promise<number> {
    if (!serviceIds.length) return 0;
    const memberTotal = await countAttendance(serviceIds);
    if (memberIds !== null) return memberTotal; // fellowship-filtered: members only
    const [newFtCnt, retFtCnt, teensCnt, childrenCnt] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(firstTimersTable)
        .where(and(inArray(firstTimersTable.serviceId, serviceIds), eq(firstTimersTable.isReturning, false), eq(firstTimersTable.isRegistrationError, false))),
      db.select({ count: sql<number>`count(*)` }).from(firstTimersTable)
        .where(and(inArray(firstTimersTable.serviceId, serviceIds), eq(firstTimersTable.isReturning, true), eq(firstTimersTable.isRegistrationError, false))),
      db.select({ count: sql<number>`count(*)` }).from(serviceTeensAttendanceTable)
        .where(inArray(serviceTeensAttendanceTable.serviceId, serviceIds)),
      db.select({ count: sql<number>`count(*)` }).from(serviceChildrenAttendanceTable)
        .where(inArray(serviceChildrenAttendanceTable.serviceId, serviceIds)),
    ]);
    return memberTotal + Number(newFtCnt[0].count) + Number(retFtCnt[0].count) + Number(teensCnt[0].count) + Number(childrenCnt[0].count);
  }

  if (view === "month") {
    const m = month || new Date().toISOString().slice(0, 7);
    const [y, mo] = m.split("-");
    const startDate = `${y}-${mo.padStart(2, "0")}-01`;
    const endDate = `${y}-${mo.padStart(2, "0")}-31`;

    const services = await db.select().from(servicesTable)
      .where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)))
      .orderBy(servicesTable.date);

    const dataPoints = await Promise.all(services.map(async (svc) => {
      const total = await countFullAttendance([svc.id]);
      return {
        label: svc.date
          ? new Date(svc.date + "T00:00:00").toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" })
          : svc.name,
        serviceName: svc.name,
        date: svc.date,
        total,
      };
    }));

    return res.json({ view: "month", month: m, dataPoints });
  }

  // Year view — one point per month up to current
  const y = year || String(new Date().getFullYear());
  const currentYear = new Date().getFullYear();
  const maxMonth = parseInt(y) === currentYear ? new Date().getMonth() + 1 : 12;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const dataPoints = await Promise.all(
    Array.from({ length: maxMonth }, (_, i) => i + 1).map(async (mo) => {
      const startDate = `${y}-${String(mo).padStart(2, "0")}-01`;
      const endDate = `${y}-${String(mo).padStart(2, "0")}-31`;
      const svcs = await db.select({ id: servicesTable.id }).from(servicesTable)
        .where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)));
      const total = await countFullAttendance(svcs.map(s => s.id));
      const avg = svcs.length > 0 ? Math.round(total / svcs.length) : 0;
      return { label: MONTHS[mo - 1], month: `${y}-${String(mo).padStart(2, "0")}`, total: avg };
    })
  );

  res.json({ view: "year", year: y, dataPoints });
});

// ─── CHILDREN / TEENS MONTHLY ATTENDANCE REPORT ──────────────────────────────

router.get("/reports/ct-attendance", async (req, res) => {
  const { month, group } = req.query as { month?: string; group?: string };
  if (!month || !group || (group !== "children" && group !== "teens")) {
    return res.status(400).json({ error: "month and group (children|teens) required" });
  }
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return res.status(400).json({ error: "Invalid month format (YYYY-MM)" });

  // Build date range for the month (text comparison works because dates are YYYY-MM-DD)
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const endDate = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  // Get all services in this month
  const services = await db
    .select({ id: servicesTable.id, name: servicesTable.name, date: servicesTable.date })
    .from(servicesTable)
    .where(and(gte(servicesTable.date, startDate), lte(servicesTable.date, endDate)));

  if (services.length === 0) return res.json({ services: [], members: [] });

  const serviceIds = services.map(s => s.id);

  // Use Drizzle ORM joins (postgres-js driver returns rows directly, not result.rows)
  type AttendRow = { serviceId: number; entityId: number; name: string; gender: string | null };

  let attendRows: AttendRow[] = [];
  if (group === "children") {
    const rows = await db
      .select({
        serviceId: serviceChildrenAttendanceTable.serviceId,
        entityId: serviceChildrenAttendanceTable.childId,
        firstName: childrenTable.firstName,
        lastName: childrenTable.lastName,
        gender: childrenTable.gender,
      })
      .from(serviceChildrenAttendanceTable)
      .innerJoin(childrenTable, eq(serviceChildrenAttendanceTable.childId, childrenTable.id))
      .where(inArray(serviceChildrenAttendanceTable.serviceId, serviceIds));
    attendRows = rows.map(r => ({
      serviceId: r.serviceId,
      entityId: r.entityId,
      name: `${r.firstName} ${r.lastName}`,
      gender: r.gender ?? null,
    }));
  } else {
    const rows = await db
      .select({
        serviceId: serviceTeensAttendanceTable.serviceId,
        entityId: serviceTeensAttendanceTable.teenId,
        firstName: teensTable.firstName,
        lastName: teensTable.lastName,
        gender: teensTable.gender,
      })
      .from(serviceTeensAttendanceTable)
      .innerJoin(teensTable, eq(serviceTeensAttendanceTable.teenId, teensTable.id))
      .where(inArray(serviceTeensAttendanceTable.serviceId, serviceIds));
    attendRows = rows.map(r => ({
      serviceId: r.serviceId,
      entityId: r.entityId,
      name: `${r.firstName} ${r.lastName}`,
      gender: r.gender ?? null,
    }));
  }

  // Build a map keyed by entity ID so the same person across services is grouped correctly
  const entityMap = new Map<number, { name: string; gender: string | null; attendance: Record<number, boolean>; attended: number; total: number }>();
  for (const row of attendRows) {
    if (!entityMap.has(row.entityId)) {
      entityMap.set(row.entityId, { name: row.name, gender: row.gender, attendance: {}, attended: 0, total: services.length });
    }
    const entry = entityMap.get(row.entityId)!;
    entry.attendance[row.serviceId] = true;
    entry.attended++;
  }

  const members = Array.from(entityMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  return res.json({ services, members });
});

export default router;