import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { membersTable, videosTable, onlineMeetingsTable, teensTable, childrenTable } from "@workspace/db";
import { desc, and, eq, sql, or, isNull, gte } from "drizzle-orm";
import { authenticateToken } from "../middlewares/auth";

const router = Router();

router.get("/home/feed", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const memberId: number | null = user.memberId ?? null;
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayMD = `${mm}-${dd}`;

    const upcomingMDs: string[] = [];
    for (let i = 1; i <= 2; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      upcomingMDs.push(`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch { return fallback; }
    };

    const mdArray = sql`ARRAY[${sql.join(upcomingMDs.map(d => sql`${d}`), sql`, `)}]`;

    const [
      memberTodayBdays,
      teenTodayBdays,
      childTodayBdays,
      todayAnniversaries,
      memberUpcomingBdays,
      teenUpcomingBdays,
      childUpcomingBdays,
      upcomingAnniversaries,
      latestVideoRows,
      announcements,
      liveMeetings,
    ] = await Promise.all([
      // Members birthday today
      safeQuery(() => db.select({
        id: membersTable.id,
        firstName: membersTable.firstName,
        lastName: membersTable.lastName,
        profilePhoto: membersTable.profilePhoto,
        dateOfBirth: membersTable.dateOfBirth,
      }).from(membersTable).where(
        and(
          eq(membersTable.isArchived, false),
          sql`${membersTable.dateOfBirth} IS NOT NULL AND TO_CHAR(${membersTable.dateOfBirth}::date, 'MM-DD') = ${todayMD}`
        )
      ), []),

      // Teens birthday today
      safeQuery(() => db.select({
        id: teensTable.id,
        firstName: teensTable.firstName,
        lastName: teensTable.lastName,
        dateOfBirth: teensTable.dateOfBirth,
      }).from(teensTable).where(
        and(
          eq(teensTable.isArchived, false),
          sql`${teensTable.dateOfBirth} IS NOT NULL AND TO_CHAR(${teensTable.dateOfBirth}::date, 'MM-DD') = ${todayMD}`
        )
      ), []),

      // Children birthday today
      safeQuery(() => db.select({
        id: childrenTable.id,
        firstName: childrenTable.firstName,
        lastName: childrenTable.lastName,
        dateOfBirth: childrenTable.dateOfBirth,
      }).from(childrenTable).where(
        and(
          eq(childrenTable.isArchived, false),
          sql`${childrenTable.dateOfBirth} IS NOT NULL AND TO_CHAR(${childrenTable.dateOfBirth}::date, 'MM-DD') = ${todayMD}`
        )
      ), []),

      // Anniversaries today
      safeQuery(() => db.select({
        id: membersTable.id,
        firstName: membersTable.firstName,
        lastName: membersTable.lastName,
        profilePhoto: membersTable.profilePhoto,
        weddingDate: membersTable.weddingDate,
        spouseId: membersTable.spouseId,
        gender: membersTable.gender,
      }).from(membersTable).where(
        and(
          eq(membersTable.isArchived, false),
          sql`${membersTable.weddingDate} IS NOT NULL AND TO_CHAR(${membersTable.weddingDate}::date, 'MM-DD') = ${todayMD}`
        )
      ), []),

      // Members birthday upcoming
      safeQuery(() => db.select({
        id: membersTable.id,
        firstName: membersTable.firstName,
        lastName: membersTable.lastName,
        dateOfBirth: membersTable.dateOfBirth,
      }).from(membersTable).where(
        and(
          eq(membersTable.isArchived, false),
          sql`${membersTable.dateOfBirth} IS NOT NULL AND TO_CHAR(${membersTable.dateOfBirth}::date, 'MM-DD') = ANY(${mdArray})`
        )
      ), []),

      // Teens birthday upcoming
      safeQuery(() => db.select({
        id: teensTable.id,
        firstName: teensTable.firstName,
        lastName: teensTable.lastName,
        dateOfBirth: teensTable.dateOfBirth,
      }).from(teensTable).where(
        and(
          eq(teensTable.isArchived, false),
          sql`${teensTable.dateOfBirth} IS NOT NULL AND TO_CHAR(${teensTable.dateOfBirth}::date, 'MM-DD') = ANY(${mdArray})`
        )
      ), []),

      // Children birthday upcoming
      safeQuery(() => db.select({
        id: childrenTable.id,
        firstName: childrenTable.firstName,
        lastName: childrenTable.lastName,
        dateOfBirth: childrenTable.dateOfBirth,
      }).from(childrenTable).where(
        and(
          eq(childrenTable.isArchived, false),
          sql`${childrenTable.dateOfBirth} IS NOT NULL AND TO_CHAR(${childrenTable.dateOfBirth}::date, 'MM-DD') = ANY(${mdArray})`
        )
      ), []),

      // Anniversaries upcoming
      safeQuery(() => db.select({
        id: membersTable.id,
        firstName: membersTable.firstName,
        lastName: membersTable.lastName,
        weddingDate: membersTable.weddingDate,
        spouseId: membersTable.spouseId,
        gender: membersTable.gender,
      }).from(membersTable).where(
        and(
          eq(membersTable.isArchived, false),
          sql`${membersTable.weddingDate} IS NOT NULL AND TO_CHAR(${membersTable.weddingDate}::date, 'MM-DD') = ANY(${mdArray})`
        )
      ), []),

      // Latest video
      safeQuery(() => db.select().from(videosTable).orderBy(desc(videosTable.createdAt)).limit(1), []),

      // Announcements
      safeQuery(() => db.select().from(announcementsTable).where(
        and(
          eq(announcementsTable.isActive, true),
          or(
            isNull(announcementsTable.targetMemberId),
            memberId !== null
              ? eq(announcementsTable.targetMemberId, memberId)
              : isNull(announcementsTable.targetMemberId)
          ),
          or(
            isNull(announcementsTable.expiresAt),
            gte(announcementsTable.expiresAt, today)
          )
        )
      ).orderBy(desc(announcementsTable.createdAt)).limit(10), []),

      // Live meetings
      safeQuery(() => db.select({
        id: onlineMeetingsTable.id,
        title: onlineMeetingsTable.title,
        description: onlineMeetingsTable.description,
        meetingType: onlineMeetingsTable.meetingType,
        roomCode: onlineMeetingsTable.roomCode,
      }).from(onlineMeetingsTable).where(
        and(
          eq(onlineMeetingsTable.isActive, true),
          sql`${onlineMeetingsTable.meetingType} != 'restricted'`,
        )
      ).limit(5), []),
    ]);

    // Merge birthdays with personType tag
    const todayBirthdays = [
      ...(memberTodayBdays as any[]).map(m => ({ ...m, personType: "member" })),
      ...(teenTodayBdays as any[]).map(t => ({ ...t, personType: "teen" })),
      ...(childTodayBdays as any[]).map(c => ({ ...c, personType: "child" })),
    ];

    const upcomingBirthdays = [
      ...(memberUpcomingBdays as any[]).map(m => ({ ...m, personType: "member" })),
      ...(teenUpcomingBdays as any[]).map(t => ({ ...t, personType: "teen" })),
      ...(childUpcomingBdays as any[]).map(c => ({ ...c, personType: "child" })),
    ];

    res.json({
      todayBirthdays,
      todayAnniversaries,
      upcomingBirthdays,
      upcomingAnniversaries,
      latestVideo: (latestVideoRows as any[])[0] ?? null,
      announcements,
      liveMeetings,
    });
  } catch (err) {
    console.error("[home/feed] error:", err);
    res.json({
      todayBirthdays: [],
      todayAnniversaries: [],
      upcomingBirthdays: [],
      upcomingAnniversaries: [],
      latestVideo: null,
      announcements: [],
      liveMeetings: [],
    });
  }
});

export default router;
