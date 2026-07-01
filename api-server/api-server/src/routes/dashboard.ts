import { Router } from "express";
import { db } from "@workspace/db";
import {
  membersTable, cellsTable, seniorCellsTable, pcfsTable,
  departmentsTable, childrenTable, teensTable, firstTimersTable,
  servicesTable, attendanceRecordsTable, givingsTable, activityLogTable, ministryYearsTable,
  familiesTable,
} from "@workspace/db";
import { eq, and, sql, gte, isNull, not } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";

const router = Router();
router.use(authenticateToken);

function fmt(m: { title?: string | null; firstName: string; lastName: string }): string {
  return m.title ? `${m.title} ${m.firstName} ${m.lastName}` : `${m.firstName} ${m.lastName}`;
}

router.get("/summary", async (req, res) => {
  const [
    totalMembersRes, totalVisitorsRes, totalCellsRes, totalSCsRes, totalPcfsRes,
    totalFTRes, totalChildrenRes, totalTeensRes, totalDeptsRes, cellsNoLeaderRes,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.isArchived, false), eq(membersTable.memberType, "member"))),
    db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.isArchived, false), eq(membersTable.memberType, "visitor"))),
    db.select({ count: sql<number>`count(*)` }).from(cellsTable).where(eq(cellsTable.isArchived, false)),
    db.select({ count: sql<number>`count(*)` }).from(seniorCellsTable).where(eq(seniorCellsTable.isArchived, false)),
    db.select({ count: sql<number>`count(*)` }).from(pcfsTable).where(eq(pcfsTable.isArchived, false)),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable).where(eq(firstTimersTable.isArchived, false)),
    db.select({ count: sql<number>`count(*)` }).from(childrenTable).where(eq(childrenTable.isArchived, false)),
    db.select({ count: sql<number>`count(*)` }).from(teensTable).where(eq(teensTable.isArchived, false)),
    db.select({ count: sql<number>`count(*)` }).from(departmentsTable).where(eq(departmentsTable.isArchived, false)),
    db.select({ count: sql<number>`count(*)` }).from(cellsTable).where(and(eq(cellsTable.isArchived, false), isNull(cellsTable.leaderId))),
  ]);

  const activeService = await db.select().from(servicesTable).where(eq(servicesTable.status, "open")).limit(1);
  let recentServiceAttendance = 0;
  if (activeService.length) {
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable).where(eq(attendanceRecordsTable.serviceId, activeService[0].id));
    recentServiceAttendance = Number(cnt[0].count);
  } else {
    const lastService = await db.select().from(servicesTable).orderBy(servicesTable.date).limit(1);
    if (lastService.length) {
      const cnt = await db.select({ count: sql<number>`count(*)` }).from(attendanceRecordsTable).where(eq(attendanceRecordsTable.serviceId, lastService[0].id));
      recentServiceAttendance = Number(cnt[0].count);
    }
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthStartDate = new Date(monthStart);

  const [monthGivings, newMembersThisMonthRes, firstTimersThisMonthRes, totalFamiliesRes] = await Promise.all([
    db.select({ total: sql<number>`sum(amount::numeric)` }).from(givingsTable).where(and(eq(givingsTable.isArchived, false), gte(givingsTable.date, monthStart))),
    db.select({ count: sql<number>`count(*)` }).from(membersTable).where(and(eq(membersTable.isArchived, false), eq(membersTable.memberType, "member"), gte(membersTable.createdAt, monthStartDate))),
    db.select({ count: sql<number>`count(*)` }).from(firstTimersTable).where(and(eq(firstTimersTable.isArchived, false), gte(firstTimersTable.createdAt, monthStartDate))),
    db.select({ count: sql<number>`count(*)` }).from(familiesTable),
  ]);

  res.json({
    totalMembers: Number(totalMembersRes[0].count),
    totalVisitors: Number(totalVisitorsRes[0].count),
    totalCells: Number(totalCellsRes[0].count),
    totalSeniorCells: Number(totalSCsRes[0].count),
    totalPcfs: Number(totalPcfsRes[0].count),
    totalFirstTimers: Number(totalFTRes[0].count),
    totalChildren: Number(totalChildrenRes[0].count),
    totalTeens: Number(totalTeensRes[0].count),
    totalDepartments: Number(totalDeptsRes[0].count),
    cellsWithoutLeaders: Number(cellsNoLeaderRes[0].count),
    activeService: activeService.length ? activeService[0] : null,
    recentServiceAttendance,
    thisMonthGivingTotal: Number(monthGivings[0].total) || 0,
    newMembersThisMonth: Number(newMembersThisMonthRes[0].count),
    firstTimersThisMonth: Number(firstTimersThisMonthRes[0].count),
    totalFamilies: Number(totalFamiliesRes[0].count),
  });
});

router.get("/birthdays", async (req, res) => {
  const today = new Date();

  function calcDaysUntil(dob: string): number {
    const d = new Date(dob);
    const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    let days = Math.ceil((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) days += 365;
    return days;
  }

  const [members, children, teens] = await Promise.all([
    db.select().from(membersTable).where(and(eq(membersTable.isArchived, false), not(isNull(membersTable.dateOfBirth)))),
    db.select().from(childrenTable).where(and(eq(childrenTable.isArchived, false), not(isNull(childrenTable.dateOfBirth)))),
    db.select().from(teensTable).where(and(eq(teensTable.isArchived, false), not(isNull(teensTable.dateOfBirth)))),
  ]);

  const memberItems = members
    .filter(m => m.dateOfBirth)
    .map(m => ({
      memberId: m.id,
      memberName: fmt(m),
      profilePhoto: m.profilePhoto,
      date: m.dateOfBirth,
      daysUntil: calcDaysUntil(m.dateOfBirth!),
      type: "member",
    }));

  const childItems = children
    .filter(c => c.dateOfBirth)
    .map(c => ({
      memberId: null,
      memberName: `${c.firstName} ${c.lastName}`,
      profilePhoto: null,
      date: c.dateOfBirth,
      daysUntil: calcDaysUntil(c.dateOfBirth!),
      type: "child",
    }));

  const teenItems = teens
    .filter(t => t.dateOfBirth)
    .map(t => ({
      memberId: null,
      memberName: `${t.firstName} ${t.lastName}`,
      profilePhoto: null,
      date: t.dateOfBirth,
      daysUntil: calcDaysUntil(t.dateOfBirth!),
      type: "teen",
    }));

  const birthdayItems = [...memberItems, ...childItems, ...teenItems]
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 15);

  res.json({ birthdays: birthdayItems, anniversaries: [] });
});

router.get("/recent-activity", async (req, res) => {
  const activities = await db.select().from(activityLogTable).orderBy(activityLogTable.createdAt).limit(20);
  res.json(activities.map(a => ({
    id: a.id,
    type: a.type,
    description: a.description,
    timestamp: a.createdAt.toISOString(),
    memberId: a.memberId,
    memberName: a.memberName,
  })));
});

export default router;
