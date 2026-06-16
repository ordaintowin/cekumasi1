import { Router } from "express";
import { db } from "@workspace/db";
import {
  onlineMeetingsTable,
  meetingParticipantsTable,
  meetingSignalsTable,
  meetingMessagesTable,
  membersTable,
} from "@workspace/db";
import { eq, and, gt, isNull, desc, sql } from "drizzle-orm";
import { authenticateToken, optionalAuth } from "../middlewares/auth";
import { AccessToken } from "livekit-server-sdk";
import { publishMeeting, subscribeMeeting } from "../meetingBus.js";

const router = Router();
const PARTICIPANT_TIMEOUT_MS = 15_000;

// GET /conference/:id/public-info — no auth, used by the guest invite-link page
router.get("/:id/public-info", async (req, res) => {
  const meetingId = parseInt(req.params.id);
  if (!meetingId) return res.status(400).json({ error: "Invalid meeting id" });
  try {
    const rows = await db.execute(
      sql`SELECT id, title, is_active, meeting_type FROM online_meetings WHERE id = ${meetingId} LIMIT 1`,
    );
    const m = (rows as any[])[0];
    if (!m) return res.status(404).json({ error: "Meeting not found" });
    res.json({
      id: m.id,
      title: m.title,
      isActive: m.is_active,
      meetingType: m.meeting_type ?? "open",
    });
  } catch (err: any) {
    console.error("[public-info] DB error:", err?.message, err?.stack);
    res.status(500).json({ error: "Database error", detail: err?.message });
  }
});


async function getActiveParticipants(meetingId: number) {
  const cutoff = new Date(Date.now() - PARTICIPANT_TIMEOUT_MS);
  return db
    .select()
    .from(meetingParticipantsTable)
    .where(
      and(
        eq(meetingParticipantsTable.meetingId, meetingId),
        isNull(meetingParticipantsTable.leftAt),
        gt(meetingParticipantsTable.lastPing, cutoff),
      ),
    )
    .orderBy(meetingParticipantsTable.joinedAt);
}

async function checkGroupAccess(memberId: number, restrictedGroups: any): Promise<boolean> {
  try {
    const groups = typeof restrictedGroups === "string" ? JSON.parse(restrictedGroups) : restrictedGroups;
    if (!groups) return false;
    if (groups.pcf_leaders) {
      const r = await db.execute(
        sql`SELECT 1 FROM pcfs WHERE leader_id = ${memberId} AND is_archived = false LIMIT 1`,
      );
      if ((r as any[]).length > 0) return true;
    }
    if (groups.senior_cell_leaders) {
      const r = await db.execute(
        sql`SELECT 1 FROM senior_cells WHERE leader_id = ${memberId} AND is_archived = false LIMIT 1`,
      );
      if ((r as any[]).length > 0) return true;
    }
    if (groups.cell_leaders) {
      const r = await db.execute(
        sql`SELECT 1 FROM cells WHERE leader_id = ${memberId} AND is_archived = false LIMIT 1`,
      );
      if ((r as any[]).length > 0) return true;
    }
  } catch {}
  return false;
}

// POST /conference/:id/join
router.post("/:id/join", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const user = (req as any).user;
  const { peerId, displayName } = req.body;

  if (!peerId) return res.status(400).json({ error: "peerId required" });

  let meeting: any;
  try {
    const rows = await db.execute(
      sql`SELECT id, title, is_active, restriction_off, meeting_type, restricted_groups FROM online_meetings WHERE id = ${meetingId} LIMIT 1`,
    );
    meeting = (rows as any[])[0];
  } catch (err: any) {
    console.error("[conference/join] DB error:", err?.message, err?.stack);
    return res.status(500).json({ error: "Database error", detail: err?.message });
  }

  if (!meeting || !meeting.is_active) {
    return res.status(404).json({ error: "Meeting not found or not active" });
  }

  const meetingType: string = meeting.meeting_type ?? "open";

  if (meetingType === "restricted") {
    const isAdmin = user && user.roleLevel <= 3;
    if (!isAdmin) {
      const membId = user?.memberId ?? null;
      if (!membId) {
        return res.status(403).json({ error: "Sign in to request access to this meeting.", needsRequest: true });
      }
      const approvedRows = await db.execute(sql`
        SELECT 1 FROM meeting_join_requests
        WHERE meeting_id = ${meetingId} AND member_id = ${membId} AND status = 'approved' LIMIT 1
      `);
      if (!(approvedRows as any[])[0]) {
        return res.status(403).json({ error: "Your request has not been approved yet. Wait for the admin to admit you.", needsRequest: true });
      }
    }
  }

  let role: string = "guest";
  let finalDisplayName = displayName || "Guest";
  let memberId: number | null = null;

  if (user) {
    role = user.roleLevel <= 3 ? "admin" : "member";
    memberId = user.memberId ?? null;
    if (user.memberId) {
      try {
        const [member] = await db
          .select({ firstName: membersTable.firstName, lastName: membersTable.lastName, title: membersTable.title })
          .from(membersTable)
          .where(eq(membersTable.id, user.memberId))
          .limit(1);
        if (member) {
          const titlePart = member.title ? `${member.title} ` : "";
          finalDisplayName = `${titlePart}${member.firstName} ${member.lastName}`.trim();
        }
      } catch {}
    } else {
      finalDisplayName = user.username || "User";
    }
  } else {
    const active = await getActiveParticipants(meetingId);
    const guestCount = active.filter((p) => p.role === "guest").length;
    finalDisplayName = displayName || `Guest ${guestCount + 1}`;
  }

  try {
    await db
      .update(meetingParticipantsTable)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(meetingParticipantsTable.meetingId, meetingId),
          eq(meetingParticipantsTable.peerId, peerId),
          isNull(meetingParticipantsTable.leftAt),
        ),
      );
  } catch {}

  await db.insert(meetingParticipantsTable).values({
    meetingId,
    peerId,
    displayName: finalDisplayName,
    role,
    isMuted: false,
    isPinned: false,
    memberId,
    lastPing: new Date(),
  });

  // Push updated participant list to all SSE subscribers
  getActiveParticipants(meetingId).then((participants) => {
    publishMeeting(meetingId, { type: "participants", data: participants });
  }).catch(() => {});

  res.json({
    ok: true,
    peerId,
    displayName: finalDisplayName,
    role,
    memberId,
    unmutingAllowed: meeting.restriction_off ?? true,
    meetingTitle: meeting.title,
  });
});

// Async signal cleanup — deletes signals older than 2 hours for a given meeting.
function maybeCleanOldSignals(meetingId: number) {
  if (Math.random() > 0.05) return;
  db.execute(
    sql`DELETE FROM meeting_signals
        WHERE meeting_id = ${meetingId}
          AND created_at < now() - interval '2 hours'`,
  ).catch(() => {});
}

// POST /conference/:id/ping
router.post("/:id/ping", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const { peerId, isMuted } = req.body;
  if (!peerId) return res.status(400).json({ error: "peerId required" });

  const update: any = { lastPing: new Date() };
  if (isMuted !== undefined) update.isMuted = isMuted;

  try {
    await db
      .update(meetingParticipantsTable)
      .set(update)
      .where(
        and(
          eq(meetingParticipantsTable.meetingId, meetingId),
          eq(meetingParticipantsTable.peerId, peerId),
          isNull(meetingParticipantsTable.leftAt),
        ),
      );
  } catch {}

  maybeCleanOldSignals(meetingId);

  let unmutingAllowed = false;
  try {
    const r = await db.execute(
      sql`SELECT restriction_off FROM online_meetings WHERE id = ${meetingId} LIMIT 1`,
    );
    unmutingAllowed = (r as any[])[0]?.restriction_off ?? true;
  } catch {}

  res.json({ ok: true, unmutingAllowed });
});

// POST /conference/:id/leave
router.post("/:id/leave", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const { peerId } = req.body;
  if (!peerId) return res.json({ ok: true });

  try {
    await db
      .update(meetingParticipantsTable)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(meetingParticipantsTable.meetingId, meetingId),
          eq(meetingParticipantsTable.peerId, peerId),
          isNull(meetingParticipantsTable.leftAt),
        ),
      );
  } catch {}

  // Push updated participant list to all SSE subscribers
  getActiveParticipants(meetingId).then((participants) => {
    publishMeeting(meetingId, { type: "participants", data: participants });
  }).catch(() => {});

  res.json({ ok: true });
});

// GET /conference/:id/participants
router.get("/:id/participants", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  try {
    const participants = await getActiveParticipants(meetingId);
    res.json(participants);
  } catch {
    res.json([]);
  }
});

// GET /conference/:id/signals/:peerId
router.get("/:id/signals/:peerId", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const toPeer = req.params.peerId;
  const after = parseInt((req.query.after as string) || "0") || 0;

  try {
    const signals = await db
      .select()
      .from(meetingSignalsTable)
      .where(
        and(
          eq(meetingSignalsTable.meetingId, meetingId),
          sql`(${meetingSignalsTable.toPeer} = ${toPeer} OR ${meetingSignalsTable.toPeer} = '__broadcast__')`,
          gt(meetingSignalsTable.id, after),
        ),
      )
      .orderBy(meetingSignalsTable.id)
      .limit(100);
    res.json(signals);
  } catch {
    res.json([]);
  }
});

// POST /conference/:id/signal
router.post("/:id/signal", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const { fromPeer, toPeer, signalType, payload } = req.body;

  if (!toPeer || !signalType || !payload || !fromPeer) {
    return res.status(400).json({ error: "fromPeer, toPeer, signalType, payload required" });
  }

  try {
    const [created] = await db
      .insert(meetingSignalsTable)
      .values({
        meetingId,
        fromPeer,
        toPeer,
        signalType,
        payload: typeof payload === "string" ? payload : JSON.stringify(payload),
      })
      .returning();

    // Push signal to SSE subscribers — server filters by toPeer
    publishMeeting(meetingId, { type: "signal", data: created });

    res.json({ ok: true, id: created.id });
  } catch {
    res.status(500).json({ error: "Signal store failed" });
  }
});

// GET /conference/:id/messages
router.get("/:id/messages", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const after = parseInt((req.query.after as string) || "0") || 0;

  try {
    const messages = await db
      .select()
      .from(meetingMessagesTable)
      .where(
        and(
          eq(meetingMessagesTable.meetingId, meetingId),
          gt(meetingMessagesTable.id, after),
        ),
      )
      .orderBy(meetingMessagesTable.id)
      .limit(50);
    res.json(messages);
  } catch {
    res.json([]);
  }
});

// POST /conference/:id/message
router.post("/:id/message", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const { peerId, content, msgType } = req.body;

  if (!peerId || !content) return res.status(400).json({ error: "peerId and content required" });

  try {
    const [participant] = await db
      .select({ displayName: meetingParticipantsTable.displayName, role: meetingParticipantsTable.role })
      .from(meetingParticipantsTable)
      .where(
        and(
          eq(meetingParticipantsTable.meetingId, meetingId),
          eq(meetingParticipantsTable.peerId, peerId),
        ),
      )
      .orderBy(desc(meetingParticipantsTable.joinedAt))
      .limit(1);

    if (!participant) return res.status(403).json({ error: "Not in meeting" });

    const [created] = await db
      .insert(meetingMessagesTable)
      .values({
        meetingId,
        peerId,
        senderName: participant.displayName,
        content: String(content).trim().slice(0, 500),
        msgType: msgType || "chat",
      })
      .returning();

    // Push new message to all SSE subscribers instantly
    publishMeeting(meetingId, { type: "message", data: created });

    res.json(created);
  } catch {
    res.status(500).json({ error: "Message store failed" });
  }
});

// POST /conference/:id/control  (admin/co-host only)
router.post("/:id/control", authenticateToken, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const { peerId, action, targetPeerId } = req.body;

  const [adminParticipant] = await db
    .select()
    .from(meetingParticipantsTable)
    .where(
      and(
        eq(meetingParticipantsTable.meetingId, meetingId),
        eq(meetingParticipantsTable.peerId, peerId),
        isNull(meetingParticipantsTable.leftAt),
      ),
    )
    .limit(1);

  if (!adminParticipant || (adminParticipant.role !== "admin" && adminParticipant.role !== "co-host")) {
    return res.status(403).json({ error: "Not an admin in this meeting" });
  }

  switch (action) {
    case "mute-all": {
      await db
        .update(meetingParticipantsTable)
        .set({ isMuted: true })
        .where(
          and(eq(meetingParticipantsTable.meetingId, meetingId), isNull(meetingParticipantsTable.leftAt)),
        );
      const [sysMsg] = await db.insert(meetingMessagesTable).values({
        meetingId, peerId,
        senderName: adminParticipant.displayName,
        content: "The host has muted all participants.",
        msgType: "system",
      }).returning();
      publishMeeting(meetingId, { type: "message", data: sysMsg });
      // Broadcast a real-time signal so every client immediately disables their mic
      const [muteAllSig] = await db.insert(meetingSignalsTable).values({
        meetingId, fromPeer: peerId, toPeer: "__broadcast__",
        signalType: "mute-all", payload: "{}",
      }).returning();
      publishMeeting(meetingId, { type: "signal", data: muteAllSig });
      getActiveParticipants(meetingId).then((p) =>
        publishMeeting(meetingId, { type: "participants", data: p })
      ).catch(() => {});
      return res.json({ ok: true });
    }

    case "kick": {
      if (!targetPeerId) return res.status(400).json({ error: "targetPeerId required" });
      const [sig] = await db.insert(meetingSignalsTable).values({
        meetingId, fromPeer: peerId, toPeer: targetPeerId, signalType: "kicked", payload: "{}",
      }).returning();
      publishMeeting(meetingId, { type: "signal", data: sig });
      await db
        .update(meetingParticipantsTable)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(meetingParticipantsTable.meetingId, meetingId),
            eq(meetingParticipantsTable.peerId, targetPeerId),
            isNull(meetingParticipantsTable.leftAt),
          ),
        );
      getActiveParticipants(meetingId).then((p) =>
        publishMeeting(meetingId, { type: "participants", data: p })
      ).catch(() => {});
      return res.json({ ok: true });
    }

    case "force-mute": {
      if (!targetPeerId) return res.status(400).json({ error: "targetPeerId required" });
      await db
        .update(meetingParticipantsTable)
        .set({ isMuted: true })
        .where(
          and(
            eq(meetingParticipantsTable.meetingId, meetingId),
            eq(meetingParticipantsTable.peerId, targetPeerId),
            isNull(meetingParticipantsTable.leftAt),
          ),
        );
      const [sig] = await db.insert(meetingSignalsTable).values({
        meetingId, fromPeer: peerId, toPeer: targetPeerId, signalType: "force-mute", payload: "{}",
      }).returning();
      publishMeeting(meetingId, { type: "signal", data: sig });
      getActiveParticipants(meetingId).then((p) =>
        publishMeeting(meetingId, { type: "participants", data: p })
      ).catch(() => {});
      return res.json({ ok: true });
    }

    case "assign-host": {
      if (!targetPeerId) return res.status(400).json({ error: "targetPeerId required" });
      const activeAdmins = await db
        .select()
        .from(meetingParticipantsTable)
        .where(
          and(
            eq(meetingParticipantsTable.meetingId, meetingId),
            isNull(meetingParticipantsTable.leftAt),
            sql`${meetingParticipantsTable.role} IN ('admin','co-host')`,
          ),
        );
      if (activeAdmins.length >= 3) {
        return res.status(400).json({ error: "Maximum 3 concurrent admins allowed" });
      }
      await db
        .update(meetingParticipantsTable)
        .set({ role: "co-host" })
        .where(
          and(
            eq(meetingParticipantsTable.meetingId, meetingId),
            eq(meetingParticipantsTable.peerId, targetPeerId),
            isNull(meetingParticipantsTable.leftAt),
          ),
        );
      const [sig] = await db.insert(meetingSignalsTable).values({
        meetingId, fromPeer: peerId, toPeer: targetPeerId,
        signalType: "role-changed", payload: JSON.stringify({ role: "co-host" }),
      }).returning();
      publishMeeting(meetingId, { type: "signal", data: sig });
      getActiveParticipants(meetingId).then((p) =>
        publishMeeting(meetingId, { type: "participants", data: p })
      ).catch(() => {});
      return res.json({ ok: true });
    }

    case "revoke-host": {
      if (!targetPeerId) return res.status(400).json({ error: "targetPeerId required" });
      await db
        .update(meetingParticipantsTable)
        .set({ role: "member" })
        .where(
          and(
            eq(meetingParticipantsTable.meetingId, meetingId),
            eq(meetingParticipantsTable.peerId, targetPeerId),
            eq(meetingParticipantsTable.role, "co-host"),
            isNull(meetingParticipantsTable.leftAt),
          ),
        );
      const [sig] = await db.insert(meetingSignalsTable).values({
        meetingId, fromPeer: peerId, toPeer: targetPeerId,
        signalType: "role-changed", payload: JSON.stringify({ role: "member" }),
      }).returning();
      publishMeeting(meetingId, { type: "signal", data: sig });
      getActiveParticipants(meetingId).then((p) =>
        publishMeeting(meetingId, { type: "participants", data: p })
      ).catch(() => {});
      return res.json({ ok: true });
    }

    case "toggle-unmute-rule": {
      const r = await db.execute(
        sql`SELECT restriction_off FROM online_meetings WHERE id = ${meetingId} LIMIT 1`,
      );
      const current = (r as any[])[0]?.restriction_off ?? false;
      const newValue = !current;
      await db.execute(
        sql`UPDATE online_meetings SET restriction_off = ${newValue} WHERE id = ${meetingId}`,
      );
      const [sysMsg] = await db.insert(meetingMessagesTable).values({
        meetingId, peerId,
        senderName: adminParticipant.displayName,
        content: newValue
          ? "The host has allowed participants to unmute freely."
          : "The host has restricted unmuting. Raise your hand to speak.",
        msgType: "system",
      }).returning();
      publishMeeting(meetingId, { type: "message", data: sysMsg });
      return res.json({ ok: true, unmutingAllowed: newValue });
    }

    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
});

// POST /conference/:id/broadcast — optimized: single DB row + bus event (was O(N) inserts)
router.post("/:id/broadcast", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const { fromPeer, signalType, payload } = req.body;
  if (!fromPeer || !signalType || !payload) {
    return res.status(400).json({ error: "fromPeer, signalType, payload required" });
  }
  try {
    // Store a single broadcast row (toPeer='__broadcast__') instead of N per-peer rows.
    // SSE subscribers receive it immediately; the DB row serves as history for reconnects.
    const [created] = await db.insert(meetingSignalsTable).values({
      meetingId,
      fromPeer,
      toPeer: "__broadcast__",
      signalType,
      payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    }).returning();

    publishMeeting(meetingId, { type: "signal", data: created });
    res.json({ ok: true, id: created.id });
  } catch {
    res.status(500).json({ error: "Broadcast failed" });
  }
});

// GET /conference/:id/stream — Server-Sent Events for real-time meeting updates
// Replaces the client-side polling for participants, messages, and signals.
router.get("/:id/stream", optionalAuth, (req, res) => {
  const meetingId = parseInt(req.params.id);
  const peerId = (req.query.peerId as string) ?? "";
  const role = (req.query.role as string) ?? "";
  const afterSignalId = parseInt((req.query.afterSignal as string) ?? "0") || 0;
  const afterMessageId = parseInt((req.query.afterMessage as string) ?? "0") || 0;
  const isAdmin = role === "admin" || role === "co-host";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;

  const send = (type: string, data: unknown) => {
    if (closed) return;
    try {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    } catch {}
  };

  // Initial snapshot: participants + catch-up messages + catch-up signals
  (async () => {
    try {
      const participants = await getActiveParticipants(meetingId);
      send("participants", participants);
    } catch {}

    if (afterMessageId > 0) {
      try {
        const msgs = await db
          .select()
          .from(meetingMessagesTable)
          .where(
            and(
              eq(meetingMessagesTable.meetingId, meetingId),
              gt(meetingMessagesTable.id, afterMessageId),
            ),
          )
          .orderBy(meetingMessagesTable.id)
          .limit(100);
        msgs.forEach((m) => send("message", m));
      } catch {}
    }

    if (afterSignalId > 0 && peerId) {
      try {
        const sigs = await db
          .select()
          .from(meetingSignalsTable)
          .where(
            and(
              eq(meetingSignalsTable.meetingId, meetingId),
              sql`(${meetingSignalsTable.toPeer} = ${peerId} OR ${meetingSignalsTable.toPeer} = '__broadcast__')`,
              gt(meetingSignalsTable.id, afterSignalId),
            ),
          )
          .orderBy(meetingSignalsTable.id)
          .limit(100);
        sigs.forEach((s) => send("signal", s));
      } catch {}
    }
  })();

  // Subscribe to real-time events
  const unsubscribe = subscribeMeeting(meetingId, (ev) => {
    const e = ev as any;

    // Signals are filtered by recipient
    if (e.type === "signal") {
      const tp = e.data?.toPeer;
      if (tp !== "__broadcast__" && tp !== peerId) return;
    }

    // Join requests only go to admins / co-hosts
    if (e.type === "joinRequests" && !isAdmin) return;

    send(e.type, e.data);
  });

  // Keep-alive comment every 20 s to prevent proxy timeouts
  const keepAlive = setInterval(() => {
    if (!closed) {
      try {
        res.write(": ping\n\n");
        (res as any).flush?.();
      } catch {}
    }
  }, 20_000);

  req.on("close", () => {
    closed = true;
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// POST /conference/:id/livekit-token — generate LiveKit room access token
router.post("/:id/livekit-token", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  const { peerId } = req.body;

  if (!peerId) return res.status(400).json({ error: "peerId required" });

  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  const wsUrl = process.env["LIVEKIT_WS_URL"] || "ws://localhost:7880";

  if (!apiKey || !apiSecret) {
    return res.status(503).json({
      error: "LiveKit is not configured on this server. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_WS_URL.",
    });
  }

  try {
    const rows = await db.execute(
      sql`SELECT id, title, is_active FROM online_meetings WHERE id = ${meetingId} LIMIT 1`,
    );
    const meeting = (rows as any[])[0];
    if (!meeting || !meeting.is_active) {
      return res.status(404).json({ error: "Meeting not found or not active" });
    }

    const [participant] = await db
      .select({ displayName: meetingParticipantsTable.displayName, role: meetingParticipantsTable.role })
      .from(meetingParticipantsTable)
      .where(
        and(
          eq(meetingParticipantsTable.meetingId, meetingId),
          eq(meetingParticipantsTable.peerId, peerId),
          isNull(meetingParticipantsTable.leftAt),
        ),
      )
      .orderBy(desc(meetingParticipantsTable.joinedAt))
      .limit(1);

    if (!participant) {
      return res.status(403).json({ error: "Join the meeting first before requesting a media token" });
    }

    const roomName = `meeting-${meetingId}`;
    const at = new AccessToken(apiKey, apiSecret, {
      identity: peerId,
      name: participant.displayName,
      ttl: "4h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: participant.role !== "guest",
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    res.json({ token, url: wsUrl, room: roomName });
  } catch (err: any) {
    console.error("[conference/livekit-token]", err?.message);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// GET /conference/:id/state
router.get("/:id/state", optionalAuth, async (req, res) => {
  const meetingId = parseInt(req.params.id);
  try {
    const r = await db.execute(
      sql`SELECT id, title, is_active, restriction_off, meeting_type FROM online_meetings WHERE id = ${meetingId} LIMIT 1`,
    );
    const meeting = (r as any[])[0];
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    const active = await getActiveParticipants(meetingId);
    res.json({
      id: meeting.id,
      title: meeting.title,
      isActive: meeting.is_active,
      unmutingAllowed: meeting.restriction_off ?? true,
      participantCount: active.length,
      speakerCount: active.filter((p) => !p.isMuted).length,
      meetingType: meeting.meeting_type ?? "open",
    });
  } catch {
    res.status(500).json({ error: "Failed to get meeting state" });
  }
});

export default router;
