import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { membersTable, videosTable, onlineMeetingsTable } from "@workspace/db";
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
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      upcomingMDs.push(`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch { return fallback; }
    };

    const [todayBirthdays, todayAnniversaries, upcomingBirthdays, upcomingAnniversaries, latestVideoRows, announcements, liveMeetings] = await Promise.all([
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

      safeQuery(() => db.select({
        id: membersTable.id,
        firstName: membersTable.firstName,
        lastName: membersTable.lastName,
        dateOfBirth: membersTable.dateOfBirth,
      }).from(membersTable).where(
        and(
          eq(membersTable.isArchived, false),
          sql`${membersTable.dateOfBirth} IS NOT NULL AND TO_CHAR(${membersTable.dateOfBirth}::date, 'MM-DD') = ANY(ARRAY[${sql.join(upcomingMDs.map(d => sql`${d}`), sql`, `)}])`
        )
      ), []),

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
          sql`${membersTable.weddingDate} IS NOT NULL AND TO_CHAR(${membersTable.weddingDate}::date, 'MM-DD') = ANY(ARRAY[${sql.join(upcomingMDs.map(d => sql`${d}`), sql`, `)}])`
        )
      ), []),

      safeQuery(() => db.select().from(videosTable).orderBy(desc(videosTable.createdAt)).limit(1), []),

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

    res.json({
      todayBirthdays,
      todayAnniversaries,
      upcomingBirthdays,
      upcomingAnniversaries,
      latestVideo: latestVideoRows[0] ?? null,
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
