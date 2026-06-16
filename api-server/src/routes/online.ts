import { Router } from "express";
import { db } from "@workspace/db";
import {
  videosTable, onlineMeetingsTable, membersTable,
  videoAccessTable, videoAccessRequestsTable, videoWatchersTable, videoChatsTable,
  videoWatcherSessionsTable, cellsTable,
  announcementsTable, meetingSignalsTable, meetingParticipantsTable,
} from "@workspace/db";
import { eq, desc, and, sql, gt, inArray, isNull } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middlewares/auth";
import { publishMeeting } from "../meetingBus.js";
import crypto from "crypto";

const router = Router();

// ── HELPERS ──────────────────────────────────────────────────────────────────

function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

function buildEmbedUrl(raw: string): string {
  const ytId = getYoutubeId(raw);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?rel=0`;
  if (raw.includes("vimeo.com/")) {
    const m = raw.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return raw;
}

function extractYoutubeId(raw: string): string {
  const ytId = getYoutubeId(raw);
  return ytId ?? raw.trim().slice(0, 20);
}

// ── VIDEOS ──────────────────────────────────────────────────────────────────

router.get("/videos", async (_req, res) => {
  const videos = await db.select().from(videosTable).orderBy(desc(videosTable.createdAt));
  res.json(videos);
});

router.get("/videos/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [video] = await db.select().from(videosTable).where(eq(videosTable.id, id)).limit(1);
  if (!video) return res.status(404).json({ error: "Video not found" });
  res.json(video);
});

router.post("/videos", authenticateToken, requireRole(3), async (req, res) => {
  const { title, youtubeUrl, date, isLive, isRestricted, description } = req.body;
  if (!title || !youtubeUrl || !date) return res.status(400).json({ error: "title, youtubeUrl and date are required" });
  const youtubeId = extractYoutubeId(youtubeUrl);
  const embedUrl = buildEmbedUrl(youtubeUrl);
  const goLive = isLive ?? false;
  const [created] = await db.insert(videosTable).values({
    title, youtubeId, embedUrl, date,
    isLive: goLive,
    liveStartedAt: goLive ? new Date() : undefined,
    isRestricted: isRestricted ?? false,
    description,
    addedBy: (req as any).user?.userId,
  }).returning();
  res.status(201).json(created);
});

router.patch("/videos/:id", authenticateToken, requireRole(3), async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, youtubeUrl, date, isRestricted, description } = req.body;
  // isLive cannot be changed via PATCH — only set at creation or ended via /end-live
  const update: any = {};
  if (title !== undefined) update.title = title;
  if (youtubeUrl !== undefined) {
    update.youtubeId = extractYoutubeId(youtubeUrl);
    update.embedUrl = buildEmbedUrl(youtubeUrl);
  }
  if (date !== undefined) update.date = date;
  if (isRestricted !== undefined) update.isRestricted = isRestricted;
  if (description !== undefined) update.description = description;
  const [updated] = await db.update(videosTable).set(update).where(eq(videosTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Video not found" });
  res.json(updated);
});

// End live — sets isLive=false and liveEnded=true (cannot be re-activated)
router.post("/videos/:id/end-live", authenticateToken, requireRole(3), async (req, res) => {
  const id = parseInt(req.params.id);
  const [video] = await db.select().from(videosTable).where(eq(videosTable.id, id)).limit(1);
  if (!video) return res.status(404).json({ error: "Video not found" });
  if (!video.isLive) return res.status(400).json({ error: "Video is not currently live" });
  // Close any open watcher sessions
  await db.update(videoWatcherSessionsTable)
    .set({ leftAt: new Date() })
    .where(and(
      eq(videoWatcherSessionsTable.videoId, id),
      isNull(videoWatcherSessionsTable.leftAt),
    ));
  const [updated] = await db.update(videosTable)
    .set({ isLive: false, liveEnded: true })
    .where(eq(videosTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/videos/:id", authenticateToken, requireRole(3), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(videosTable).where(eq(videosTable.id, id));
  res.json({ success: true });
});

// ── VIDEO PRESENCE & ACCESS ──────────────────────────────────────────────────

// Get watchers for a video (active in last 28 seconds)
router.get("/videos/:id/watchers", authenticateToken, async (req, res) => {
  const videoId = parseInt(req.params.id);
  const cutoff = new Date(Date.now() - 28_000);
  const rows = await db.select().from(videoWatchersTable)
    .where(and(eq(videoWatchersTable.videoId, videoId), gt(videoWatchersTable.lastPing, cutoff)));
  const memberIds = rows.map(r => r.memberId);
  if (!memberIds.length) return res.json([]);
  const members = await db.select().from(membersTable).where(inArray(membersTable.id, memberIds));
  const cellIds = members.map(m => m.cellId).filter((x): x is number => x != null);
  const cells = cellIds.length ? await db.select().from(cellsTable).where(inArray(cellsTable.id, cellIds)) : [];
  const result = members.map(m => ({
    memberId: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    gender: m.gender,
    title: m.title,
    cellName: cells.find(c => c.id === m.cellId)?.name ?? null,
    joinedAt: rows.find(r => r.memberId === m.id)?.joinedAt ?? null,
  }));
  res.json(result);
});

// Watcher sessions report — all viewers with duration (even if they left and rejoined)
router.get("/videos/:id/watcher-sessions", authenticateToken, requireRole(3), async (req, res) => {
  const videoId = parseInt(req.params.id);
  const sessions = await db.select().from(videoWatcherSessionsTable)
    .where(eq(videoWatcherSessionsTable.videoId, videoId))
    .orderBy(videoWatcherSessionsTable.joinedAt);
  if (!sessions.length) return res.json([]);
  const memberIds = [...new Set(sessions.map(s => s.memberId))];
  const members = await db.select().from(membersTable).where(inArray(membersTable.id, memberIds));
  const cellIds = members.map(m => m.cellId).filter((x): x is number => x != null);
  const cells = cellIds.length ? await db.select().from(cellsTable).where(inArray(cellsTable.id, cellIds)) : [];
  const result = memberIds.map(memberId => {
    const member = members.find(m => m.id === memberId);
    const memberSessions = sessions.filter(s => s.memberId === memberId);
    const cell = cells.find(c => c.id === member?.cellId);
    const firstJoinedAt = memberSessions[0]?.joinedAt ?? null;
    const totalDurationMs = memberSessions.reduce((sum, s) => {
      const end = s.leftAt ? new Date(s.leftAt).getTime() : Date.now();
      const start = new Date(s.joinedAt).getTime();
      return sum + Math.max(0, end - start);
    }, 0);
    return {
      memberId,
      firstName: member?.firstName ?? "",
      lastName: member?.lastName ?? "",
      title: member?.title ?? "",
      cellName: cell?.name ?? "",
      firstJoinedAt,
      totalDurationMs,
      sessionCount: memberSessions.length,
    };
  });
  res.json(result);
});

// Join / heartbeat ping
router.post("/videos/:id/watch/join", authenticateToken, async (req, res) => {
  const videoId = parseInt(req.params.id);
  const userRecord = (req as any).user;
  const memberId = userRecord?.memberId;
  const roleLevel = userRecord?.roleLevel ?? 5;

  if (!memberId) return res.json({ ok: true });

  const [video] = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
  if (!video) return res.status(404).json({ error: "Video not found" });

  if (video.isRestricted && roleLevel > 4) {
    const access = await db.select().from(videoAccessTable)
      .where(and(eq(videoAccessTable.videoId, videoId), eq(videoAccessTable.memberId, memberId))).limit(1);
    if (!access.length) return res.status(403).json({ error: "No access to this video" });
  }

  // Update heartbeat watcher record
  const existing = await db.select().from(videoWatchersTable)
    .where(and(eq(videoWatchersTable.videoId, videoId), eq(videoWatchersTable.memberId, memberId))).limit(1);
  if (existing.length) {
    await db.update(videoWatchersTable).set({ lastPing: new Date() })
      .where(and(eq(videoWatchersTable.videoId, videoId), eq(videoWatchersTable.memberId, memberId)));
  } else {
    await db.insert(videoWatchersTable).values({ videoId, memberId });
  }

  // Open a new session if none is open
  if (video.isLive) {
    const openSession = await db.select().from(videoWatcherSessionsTable)
      .where(and(
        eq(videoWatcherSessionsTable.videoId, videoId),
        eq(videoWatcherSessionsTable.memberId, memberId),
        isNull(videoWatcherSessionsTable.leftAt),
      )).limit(1);
    if (!openSession.length) {
      await db.insert(videoWatcherSessionsTable).values({ videoId, memberId });
    }
  }

  res.json({ ok: true });
});

// Leave
router.post("/videos/:id/watch/leave", authenticateToken, async (req, res) => {
  const videoId = parseInt(req.params.id);
  const memberId = (req as any).user?.memberId;
  if (!memberId) return res.json({ ok: true });
  // Close open session
  await db.update(videoWatcherSessionsTable)
    .set({ leftAt: new Date() })
    .where(and(
      eq(videoWatcherSessionsTable.videoId, videoId),
      eq(videoWatcherSessionsTable.memberId, memberId),
      isNull(videoWatcherSessionsTable.leftAt),
    ));
  await db.delete(videoWatchersTable)
    .where(and(eq(videoWatchersTable.videoId, videoId), eq(videoWatchersTable.memberId, memberId)));
  res.json({ ok: true });
});

// Check own access
router.get("/videos/:id/access", authenticateToken, async (req, res) => {
  const videoId = parseInt(req.params.id);
  const memberId = (req as any).user?.memberId;
  if (!memberId) return res.json({ hasAccess: false, requestStatus: null, rejectionReason: null });
  const access = await db.select().from(videoAccessTable)
    .where(and(eq(videoAccessTable.videoId, videoId), eq(videoAccessTable.memberId, memberId))).limit(1);
  const request = await db.select().from(videoAccessRequestsTable)
    .where(and(eq(videoAccessRequestsTable.videoId, videoId), eq(videoAccessRequestsTable.memberId, memberId))).limit(1);
  res.json({
    hasAccess: access.length > 0,
    requestStatus: request[0]?.status ?? null,
    rejectionReason: request[0]?.rejectionReason ?? null,
  });
});

// Request access (also allows re-requesting after rejection)
router.post("/videos/:id/access-request", authenticateToken, async (req, res) => {
  const videoId = parseInt(req.params.id);
  const memberId = (req as any).user?.memberId;
  if (!memberId) return res.status(400).json({ error: "No member account linked to this user" });
  const existing = await db.select().from(videoAccessRequestsTable)
    .where(and(eq(videoAccessRequestsTable.videoId, videoId), eq(videoAccessRequestsTable.memberId, memberId))).limit(1);
  if (existing.length) {
    if (existing[0].status === "rejected") {
      const [updated] = await db.update(videoAccessRequestsTable)
        .set({ status: "pending", rejectionReason: null })
        .where(and(eq(videoAccessRequestsTable.videoId, videoId), eq(videoAccessRequestsTable.memberId, memberId)))
        .returning();
      return res.json(updated);
    }
    return res.json(existing[0]);
  }
  const [created] = await db.insert(videoAccessRequestsTable).values({ videoId, memberId }).returning();
  res.status(201).json(created);
});

// Admin: get access requests
router.get("/videos/:id/access-requests", authenticateToken, requireRole(3), async (req, res) => {
  const videoId = parseInt(req.params.id);
  const requests = await db.select().from(videoAccessRequestsTable)
    .where(and(eq(videoAccessRequestsTable.videoId, videoId), eq(videoAccessRequestsTable.status, "pending")));
  if (!requests.length) return res.json([]);
  const memberIds = requests.map(r => r.memberId);
  const members = await db.select().from(membersTable).where(inArray(membersTable.id, memberIds));
  const result = requests.map(r => ({
    ...r,
    member: members.find(m => m.id === r.memberId) ?? null,
  }));
  res.json(result);
});

// Admin: grant access
router.post("/videos/:id/access-grant/:memberId", authenticateToken, requireRole(3), async (req, res) => {
  const videoId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);
  const grantedBy = (req as any).user?.id;
  const existing = await db.select().from(videoAccessTable)
    .where(and(eq(videoAccessTable.videoId, videoId), eq(videoAccessTable.memberId, memberId))).limit(1);
  if (!existing.length) {
    await db.insert(videoAccessTable).values({ videoId, memberId, grantedBy });
  }
  await db.update(videoAccessRequestsTable).set({ status: "granted" })
    .where(and(eq(videoAccessRequestsTable.videoId, videoId), eq(videoAccessRequestsTable.memberId, memberId)));
  try {
    const [video] = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    await db.insert(announcementsTable).values({
      title: "Video Access Granted",
      message: `You have been granted access to watch: ${video?.title ?? "a restricted video"}.`,
      type: "video_access_granted",
      emoji: "✅",
      targetMemberId: memberId,
      createdBy: grantedBy,
    });
  } catch { /* non-critical */ }
  res.json({ ok: true });
});

// Admin: reject access request
router.post("/videos/:id/access-reject/:memberId", authenticateToken, requireRole(3), async (req, res) => {
  const videoId = parseInt(req.params.id);
  const memberId = parseInt(req.params.memberId);
  const { reason } = req.body as { reason?: string };
  const adminId = (req as any).user?.id;
  await db.update(videoAccessRequestsTable)
    .set({ status: "rejected", rejectionReason: reason ?? null })
    .where(and(eq(videoAccessRequestsTable.videoId, videoId), eq(videoAccessRequestsTable.memberId, memberId)));
  try {
    const [video] = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    const reasonText = reason ? ` Reason: ${reason}.` : "";
    await db.insert(announcementsTable).values({
      title: "Video Access Request Rejected",
      message: `Your request to watch "${video?.title ?? "a restricted video"}" was not approved.${reasonText}`,
      type: "video_access_rejected",
      emoji: "🔒",
      targetMemberId: memberId,
      createdBy: adminId,
    });
  } catch { /* non-critical */ }
  res.json({ ok: true });
});

// ── VIDEO CHAT ───────────────────────────────────────────────────────────────

router.get("/videos/:id/chat", authenticateToken, async (req, res) => {
  const videoId = parseInt(req.params.id);
  const afterId = parseInt((req.query.after as string) ?? "0") || 0;
  const rows = await db.select().from(videoChatsTable)
    .where(and(eq(videoChatsTable.videoId, videoId), gt(videoChatsTable.id, afterId)))
    .orderBy(videoChatsTable.id)
    .limit(50);
  if (!rows.length) return res.json([]);
  const memberIds = [...new Set(rows.map(r => r.memberId).filter((id): id is number => id != null))];
  const members = memberIds.length
    ? await db.select().from(membersTable).where(inArray(membersTable.id, memberIds))
    : [];
  const result = rows.map(r => ({
    id: r.id, videoId: r.videoId, userId: r.userId, memberId: r.memberId,
    senderLabel: r.senderLabel, message: r.message, createdAt: r.createdAt,
    member: r.memberId ? (members.find(m => m.id === r.memberId) ?? null) : null,
  }));
  res.json(result);
});

router.post("/videos/:id/chat", authenticateToken, async (req, res) => {
  const videoId = parseInt(req.params.id);
  const userRecord = (req as any).user;
  const userId: number = userRecord.id;
  const memberId: number | null = userRecord.memberId ?? null;
  const roleLevel: number = userRecord.roleLevel ?? 5;
  const { message } = req.body as { message?: string };
  if (!message?.trim()) return res.status(400).json({ error: "Message required" });
  const [video] = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
  if (!video) return res.status(404).json({ error: "Video not found" });
  if (!video.isLive) return res.status(400).json({ error: "Chat only available for live videos" });
  let member: any = null;
  let senderLabel: string | null = null;
  if (memberId) {
    const [m] = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
    member = m ?? null;
  } else {
    const prefix = roleLevel <= 1 ? "Admin" : (roleLevel <= 3 ? "Staff" : "User");
    senderLabel = prefix;
  }
  const [created] = await db.insert(videoChatsTable).values({
    videoId, userId, memberId, senderLabel, message: message.trim(),
  }).returning();
  res.status(201).json({ ...created, member: member ?? null });
});

router.delete("/videos/:id/chat", authenticateToken, requireRole(3), async (req, res) => {
  const videoId = parseInt(req.params.id);
  await db.delete(videoChatsTable).where(eq(videoChatsTable.videoId, videoId));
  res.json({ ok: true });
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

router.get("/notifications/pending-requests", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const isEligible = user && (user.roleLevel === 1 || (user.roleLevel === 3 && user.roleSubtype === "media"));
  if (!isEligible) return res.status(403).json({ error: "Forbidden" });
  const pending = await db.select().from(videoAccessRequestsTable)
    .where(eq(videoAccessRequestsTable.status, "pending"))
    .orderBy(desc(videoAccessRequestsTable.id));
  if (!pending.length) return res.json([]);
  const memberIds = [...new Set(pending.map(r => r.memberId))];
  const videoIds  = [...new Set(pending.map(r => r.videoId))];
  const members   = await db.select().from(membersTable).where(inArray(membersTable.id, memberIds));
  const videos    = await db.select().from(videosTable).where(inArray(videosTable.id, videoIds));
  const result = pending.map(r => ({
    ...r,
    member: members.find(m => m.id === r.memberId) ?? null,
    video:  videos.find(v => v.id === r.videoId)  ?? null,
  }));
  return res.json(result);
});

router.get("/notifications/summary", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const isEligible = user && (user.roleLevel === 1 || (user.roleLevel === 3 && user.roleSubtype === "media"));
  if (!isEligible) return res.json({ pendingAccessRequests: 0, pendingMeetingJoinRequests: 0 });
  let videoReqs: any[] = [];
  let meetingCount = 0;
  try {
    videoReqs = await db.select().from(videoAccessRequestsTable).where(eq(videoAccessRequestsTable.status, "pending"));
  } catch { /* table may not exist yet */ }
  try {
    const meetingReqs = await db.execute(sql`SELECT COUNT(*) as cnt FROM meeting_join_requests WHERE status = 'pending'`);
    meetingCount = parseInt((meetingReqs as any[])[0]?.cnt ?? "0", 10);
  } catch { /* table may not exist yet */ }
  return res.json({
    pendingAccessRequests: videoReqs.length,
    pendingMeetingJoinRequests: meetingCount,
  });
});

router.get("/notifications/meeting-join-requests", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const isEligible = user && (user.roleLevel === 1 || (user.roleLevel === 3 && user.roleSubtype === "media"));
  if (!isEligible) return res.json([]);
  try {
    const result = await db.execute(sql`
      SELECT mjr.id, mjr.meeting_id AS "meetingId", mjr.member_id AS "memberId",
             mjr.status, mjr.message, mjr.created_at AS "createdAt",
             m.first_name AS "firstName", m.last_name AS "lastName",
             m.profile_photo AS "profilePhoto", c.name AS "cellName",
             om.title AS "meetingTitle"
      FROM meeting_join_requests mjr
      LEFT JOIN members m ON m.id = mjr.member_id
      LEFT JOIN cells c ON c.id = m.cell_id
      LEFT JOIN online_meetings om ON om.id = mjr.meeting_id
      WHERE mjr.status = 'pending'
      ORDER BY mjr.created_at DESC
    `);
    const rows = (result as any[]).map(r => ({
      id: r.id, meetingId: r.meetingId, memberId: r.memberId,
      status: r.status, message: r.message, createdAt: r.createdAt,
      member: { firstName: r.firstName, lastName: r.lastName, profilePhoto: r.profilePhoto, cellName: r.cellName },
      meeting: { title: r.meetingTitle },
    }));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// ── ONLINE MEETINGS ──────────────────────────────────────────────────────────

router.get("/online-meetings", async (_req, res) => {
  const meetings = await db.select().from(onlineMeetingsTable)
    .where(isNull(onlineMeetingsTable.endedAt))
    .orderBy(desc(onlineMeetingsTable.createdAt));
  res.json(meetings);
});

router.get("/online-meetings/active", async (_req, res) => {
  const [meeting] = await db.select().from(onlineMeetingsTable).where(eq(onlineMeetingsTable.isActive, true)).limit(1);
  res.json(meeting ?? null);
});

router.post("/online-meetings", authenticateToken, requireRole(3), async (req, res) => {
  const { title, description, scheduledAt, meetingType, restrictedGroups } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const roomCode = `cek1-${crypto.randomBytes(4).toString("hex")}`;
  const adminUser = (req as any).user;
  const [created] = await db.insert(onlineMeetingsTable).values({
    title, roomCode, description, scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    isActive: false, restrictionOff: true,
    meetingType: meetingType || "open",
    restrictedGroups: restrictedGroups || "{}",
    createdBy: adminUser?.userId,
  } as any).returning();

  // Notify all members via announcement bell — only for open meetings
  const effectiveMeetingType = meetingType || "open";
  if (adminUser?.userId && effectiveMeetingType !== "restricted") {
    const typeLabel = effectiveMeetingType === "members_only" ? "Members Only" : "Open For All";
    const body = `${description ? description + " · " : ""}Type: ${typeLabel}. Open the app and go to Video Conferencing to join when it goes live.`;
    try {
      await db.insert(announcementsTable).values({
        title: `📹 New Meeting Scheduled: ${title}`,
        message: body,
        type: "meeting",
        emoji: "📹",
        createdBy: adminUser.userId,
      } as any);
    } catch { /* non-fatal */ }
  }

  res.status(201).json(created);
});

router.patch("/online-meetings/:id", authenticateToken, requireRole(3), async (req, res) => {
  const id = parseInt(req.params.id);
  const { isActive, restrictionOff, title, description, meetingType, restrictedGroups } = req.body;
  const update: any = {};
  if (isActive !== undefined) update.isActive = isActive;
  if (restrictionOff !== undefined) update.restrictionOff = restrictionOff;
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (meetingType !== undefined) update.meetingType = meetingType;
  if (restrictedGroups !== undefined) update.restrictedGroups = restrictedGroups;

  // Fetch previous state so we can detect live→on and live→off transitions
  const [prev] = await db.select({ isActive: onlineMeetingsTable.isActive, title: onlineMeetingsTable.title, meetingType: onlineMeetingsTable.meetingType })
    .from(onlineMeetingsTable).where(eq(onlineMeetingsTable.id, id)).limit(1);

  // Guard: only one live meeting at a time
  if (isActive === true && prev && !prev.isActive) {
    const [conflict] = await db
      .select({ id: onlineMeetingsTable.id, title: onlineMeetingsTable.title })
      .from(onlineMeetingsTable)
      .where(and(eq(onlineMeetingsTable.isActive, true), sql`${onlineMeetingsTable.id} != ${id}`))
      .limit(1);
    if (conflict) {
      return res.status(409).json({
        error: "A meeting is already live",
        conflictId: conflict.id,
        conflictTitle: conflict.title,
      });
    }
  }

  // When meeting ends: stamp endedAt, mark all participants left, broadcast disconnect signal
  if (isActive === false && prev?.isActive === true) {
    update.endedAt = new Date();
    await db.execute(sql`
      UPDATE meeting_participants
      SET left_at = NOW()
      WHERE meeting_id = ${id} AND left_at IS NULL
    `);
    // Broadcast "meeting-ended" to all participants via SSE (instant) + a DB row (reconnect safety).
    try {
      const [endedSig] = await db.insert(meetingSignalsTable).values({
        meetingId: id,
        fromPeer: "host",
        toPeer: "__broadcast__",
        signalType: "meeting-ended",
        payload: JSON.stringify({ reason: "host-ended" }),
      }).returning();
      // Push via SSE — every connected participant receives this immediately and calls onLeave()
      publishMeeting(id, { type: "signal", data: endedSig });
    } catch { /* non-fatal */ }
  }

  const [updated] = await db.update(onlineMeetingsTable).set(update).where(eq(onlineMeetingsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Meeting not found" });

  // Send bell notification when meeting goes LIVE — only for open meetings
  const liveMeetingType = updated.meetingType ?? prev?.meetingType ?? "open";
  if (isActive === true && prev && !prev.isActive && liveMeetingType !== "restricted") {
    const adminUser = (req as any).user;
    const meetingTitle = title ?? prev.title ?? "Meeting";
    try {
      await db.insert(announcementsTable).values({
        title: `🔴 Live Now: ${meetingTitle}`,
        message: "A meeting is now live! Open the app and go to Watch Media → Video Conferencing to join.",
        type: "meeting",
        emoji: "🔴",
        createdBy: adminUser?.userId,
      } as any);
    } catch { /* non-fatal */ }
  }

  res.json(updated);
});

router.delete("/online-meetings/:id", authenticateToken, requireRole(1), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Delete all child rows first to avoid FK constraint violations,
    // then delete the meeting itself.
    await db.execute(sql`DELETE FROM meeting_signals WHERE meeting_id = ${id}`);
    await db.execute(sql`DELETE FROM meeting_messages WHERE meeting_id = ${id}`);
    await db.execute(sql`DELETE FROM meeting_participants WHERE meeting_id = ${id}`);
    await db.execute(sql`DELETE FROM meeting_join_requests WHERE meeting_id = ${id}`);
    await db.delete(onlineMeetingsTable).where(eq(onlineMeetingsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("delete meeting error:", err);
    res.status(500).json({ error: "Failed to delete meeting" });
  }
});

// ── MEETING JOIN REQUESTS ─────────────────────────────────────────────────────

// Member: check own join status for a meeting
router.get("/meetings/:id/my-join-status", authenticateToken, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const user = (req as any).user;
  if (!user?.memberId) return res.json({ status: null });
  try {
    const rows = await db.execute(sql`
      SELECT status FROM meeting_join_requests
      WHERE meeting_id = ${meetingId} AND member_id = ${user.memberId}
      LIMIT 1
    `);
    const row = (rows as any[])[0];
    res.json({ status: row?.status ?? null });
  } catch { res.json({ status: null }); }
});

// Member: submit join request
router.post("/meetings/:id/join-request", authenticateToken, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const user = (req as any).user;
  if (!user?.memberId) return res.status(400).json({ error: "No member linked to this account" });
  const { message } = req.body;
  try {
    await db.execute(sql`
      INSERT INTO meeting_join_requests (meeting_id, member_id, status, message)
      VALUES (${meetingId}, ${user.memberId}, 'pending', ${message ?? null})
      ON CONFLICT (meeting_id, member_id)
      DO UPDATE SET status = 'pending', message = EXCLUDED.message, updated_at = NOW()
    `);
    res.json({ success: true });
  } catch (err: any) {
    console.error("join-request error:", err?.message);
    res.status(500).json({ error: "Failed to submit request" });
  }
});

// Admin: get join requests for a specific meeting
router.get("/meetings/:id/join-requests", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const isEligible = user && (user.roleLevel === 1 || (user.roleLevel === 3 && user.roleSubtype === "media"));
  if (!isEligible) return res.status(403).json({ error: "Forbidden" });
  const meetingId = parseInt(req.params.id);
  try {
    const result = await db.execute(sql`
      SELECT mjr.id, mjr.meeting_id AS "meetingId", mjr.member_id AS "memberId",
             mjr.status, mjr.message, mjr.created_at AS "createdAt",
             m.first_name AS "firstName", m.last_name AS "lastName",
             c.name AS "cellName"
      FROM meeting_join_requests mjr
      LEFT JOIN members m ON m.id = mjr.member_id
      LEFT JOIN cells c ON c.id = m.cell_id
      WHERE mjr.meeting_id = ${meetingId} AND mjr.status = 'pending'
      ORDER BY mjr.created_at ASC
    `);
    res.json((result as any[]).map(r => ({
      id: r.id, meetingId: r.meetingId, memberId: r.memberId,
      status: r.status, message: r.message, createdAt: r.createdAt,
      member: { firstName: r.firstName, lastName: r.lastName, cellName: r.cellName },
    })));
  } catch { res.json([]); }
});

// Admin: approve a join request
router.post("/meetings/:id/join-requests/:memberId/approve", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const isEligible = user && (user.roleLevel === 1 || (user.roleLevel === 3 && user.roleSubtype === "media"));
  if (!isEligible) return res.status(403).json({ error: "Forbidden" });
  const meetingId = parseInt(req.params.id);
  const memberId  = parseInt(req.params.memberId);
  try {
    await db.execute(sql`
      UPDATE meeting_join_requests SET status = 'approved', updated_at = NOW()
      WHERE meeting_id = ${meetingId} AND member_id = ${memberId}
    `);
    // Notify the member their request was approved
    try {
      const [meeting] = await db.select({ title: onlineMeetingsTable.title })
        .from(onlineMeetingsTable).where(eq(onlineMeetingsTable.id, meetingId)).limit(1);
      await db.insert(announcementsTable).values({
        title: "✅ Meeting Request Approved",
        message: `Your request to join "${meeting?.title ?? "the meeting"}" has been approved. Open the app and go to Video Conferencing to join now.`,
        type: "meeting_join_approved",
        emoji: "✅",
        targetMemberId: memberId,
        createdBy: user.id,
      } as any);
    } catch { /* non-fatal */ }
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Failed to approve" }); }
});

// Admin: reject a join request
router.post("/meetings/:id/join-requests/:memberId/reject", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const isEligible = user && (user.roleLevel === 1 || (user.roleLevel === 3 && user.roleSubtype === "media"));
  if (!isEligible) return res.status(403).json({ error: "Forbidden" });
  const meetingId = parseInt(req.params.id);
  const memberId  = parseInt(req.params.memberId);
  const { reason } = req.body ?? {};
  try {
    await db.execute(sql`
      UPDATE meeting_join_requests SET status = 'rejected', updated_at = NOW()
      WHERE meeting_id = ${meetingId} AND member_id = ${memberId}
    `);
    // Notify the member their request was not approved
    try {
      const [meeting] = await db.select({ title: onlineMeetingsTable.title })
        .from(onlineMeetingsTable).where(eq(onlineMeetingsTable.id, meetingId)).limit(1);
      const reasonText = reason ? ` Reason: ${reason}.` : "";
      await db.insert(announcementsTable).values({
        title: "🔒 Meeting Request Not Approved",
        message: `Your request to join "${meeting?.title ?? "the meeting"}" was not approved.${reasonText}`,
        type: "meeting_join_rejected",
        emoji: "🔒",
        targetMemberId: memberId,
        createdBy: user.id,
      } as any);
    } catch { /* non-fatal */ }
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Failed to reject" }); }
});

// ── MEETING SERVICES REPORT ──────────────────────────────────────────────────
// Returns all ended video-conference meetings with participant counts.
// Each member is counted once regardless of how many times they joined/rejoined.
// Guests (NULL member_id) are deduplicated by display_name, not peer_id.
router.get("/reports/meeting-services", authenticateToken, requireRole(1), async (_req, res) => {
  try {
    const meetings = await db.execute(sql`
      SELECT
        om.id,
        om.title,
        om.description,
        om.meeting_type,
        om.created_at,
        om.ended_at,
        om.is_active,
        -- Distinct logged-in members (same person rejoining counts as 1)
        COUNT(DISTINCT mp.member_id) FILTER (WHERE mp.member_id IS NOT NULL)::int AS member_count,
        -- Total unique people: members by ID + guests by display_name
        (
          COUNT(DISTINCT mp.member_id) FILTER (WHERE mp.member_id IS NOT NULL) +
          COUNT(DISTINCT LOWER(TRIM(mp.display_name))) FILTER (WHERE mp.member_id IS NULL AND mp.display_name IS NOT NULL)
        )::int AS total_count
      FROM online_meetings om
      LEFT JOIN meeting_participants mp ON mp.meeting_id = om.id
      WHERE om.ended_at IS NOT NULL
         OR (om.is_active = false AND EXISTS (
              SELECT 1 FROM meeting_participants mp2 WHERE mp2.meeting_id = om.id LIMIT 1
            ))
      GROUP BY om.id, om.title, om.description, om.meeting_type, om.created_at, om.ended_at, om.is_active
      ORDER BY COALESCE(om.ended_at, om.created_at) DESC
    `);
    res.json(Array.from(meetings as any[]));
  } catch (err) {
    console.error("meeting-services report error:", err);
    res.status(500).json({ error: "Failed to load meeting services report" });
  }
});

// ── MEETING PARTICIPANT EXPORT ────────────────────────────────────────────────
// Returns all raw participant rows; frontend deduplicates by member_id / display_name.
router.get("/meetings/:id/participants-report", authenticateToken, requireRole(1), async (req, res) => {
  const meetingId = parseInt(req.params.id);
  try {
    // Deduplicate: each unique person (by member_id for registered, display_name for guests)
    // counts exactly once. Use earliest joined_at and latest left_at across all their sessions.
    const rows = await db.execute(sql`
      WITH deduped AS (
        SELECT
          member_id,
          display_name,
          MAX(role) AS role,
          MIN(joined_at) AS joined_at,
          MAX(COALESCE(left_at, NOW())) AS left_at,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(member_id::text, display_name)
            ORDER BY MIN(joined_at)
          ) AS rn
        FROM meeting_participants
        WHERE meeting_id = ${meetingId}
        GROUP BY member_id, display_name
      )
      SELECT
        d.member_id,
        d.display_name,
        d.role,
        d.joined_at,
        d.left_at,
        m.first_name,
        m.last_name,
        m.title AS member_title,
        m.gender,
        c.name AS cell_name
      FROM deduped d
      LEFT JOIN members m ON m.id = d.member_id
      LEFT JOIN cells c ON c.id = m.cell_id
      WHERE d.rn = 1
      ORDER BY d.joined_at ASC
    `);
    res.json(Array.from(rows as any[]));
  } catch (err) {
    console.error("participants-report error:", err);
    res.status(500).json({ error: "Failed to load participants" });
  }
});

// ── ONLINE SERVICES REPORT ───────────────────────────────────────────────────
// Returns all videos that were ever live, with a count of unique viewers.
router.get("/reports/online-services", authenticateToken, requireRole(1), async (_req, res) => {
  try {
    // Get all videos that have been live (currently live or ended)
    const videos = await db
      .select()
      .from(videosTable)
      .where(sql`(${videosTable.isLive} = true OR ${videosTable.liveEnded} = true)`)
      .orderBy(desc(videosTable.liveStartedAt));

    if (!videos.length) return res.json([]);

    // For each video, count distinct members who joined
    const videoIds = videos.map(v => v.id);
    const sessionCounts = await db
      .select({
        videoId: videoWatcherSessionsTable.videoId,
        watcherCount: sql<number>`COUNT(DISTINCT ${videoWatcherSessionsTable.memberId})`,
      })
      .from(videoWatcherSessionsTable)
      .where(inArray(videoWatcherSessionsTable.videoId, videoIds))
      .groupBy(videoWatcherSessionsTable.videoId);

    const countMap: Record<number, number> = {};
    sessionCounts.forEach(r => { countMap[r.videoId] = Number(r.watcherCount); });

    const result = videos.map(v => ({
      id: v.id,
      title: v.title,
      date: v.date,
      liveStartedAt: v.liveStartedAt,
      isLive: v.isLive,
      liveEnded: v.liveEnded,
      watcherCount: countMap[v.id] ?? 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("online-services report error:", err);
    res.status(500).json({ error: "Failed to load online services report" });
  }
});

export default router;
