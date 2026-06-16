import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust Replit's reverse proxy so rate-limiting identifies users by real IP
app.set("trust proxy", 1);

// Ensure all tables exist on every startup (CREATE TABLE IF NOT EXISTS — safe to run repeatedly)
async function ensureTables() {
  const steps: Array<{ name: string; sql: string }> = [
    { name: "users", sql: `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, role_level INTEGER NOT NULL DEFAULT 5,
        role_subtype TEXT, member_id INTEGER, is_active BOOLEAN NOT NULL DEFAULT TRUE)` },
    { name: "members", sql: `CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY, membership_id TEXT NOT NULL UNIQUE,
        first_name TEXT NOT NULL, last_name TEXT NOT NULL, gender TEXT NOT NULL,
        phone1 TEXT NOT NULL, phone2 TEXT, email TEXT, occupation TEXT NOT NULL DEFAULT '',
        residential_address TEXT NOT NULL DEFAULT '', emergency_contact TEXT NOT NULL DEFAULT '',
        date_of_birth TEXT, marital_status TEXT, date_joined TEXT, foundation_school_date TEXT,
        wedding_date TEXT, is_baptized BOOLEAN NOT NULL DEFAULT FALSE, title TEXT,
        member_type TEXT NOT NULL DEFAULT 'member', cell_id INTEGER, spouse_id INTEGER,
        profile_photo TEXT, pin TEXT NOT NULL DEFAULT '0000',
        is_archived BOOLEAN NOT NULL DEFAULT FALSE, archive_reason TEXT,
        archived_at TIMESTAMPTZ, archived_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "leadership_roles", sql: `CREATE TABLE IF NOT EXISTS leadership_roles (
        id SERIAL PRIMARY KEY, member_id INTEGER NOT NULL, role TEXT NOT NULL)` },
    { name: "activity_log", sql: `CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY, type TEXT NOT NULL, description TEXT NOT NULL,
        member_id INTEGER, member_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "pcfs", sql: `CREATE TABLE IF NOT EXISTS pcfs (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, leader_id INTEGER,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE)` },
    { name: "senior_cells", sql: `CREATE TABLE IF NOT EXISTS senior_cells (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, leader_id INTEGER,
        pcf_id INTEGER, is_archived BOOLEAN NOT NULL DEFAULT FALSE)` },
    { name: "cells", sql: `CREATE TABLE IF NOT EXISTS cells (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, leader_id INTEGER,
        senior_cell_id INTEGER, is_archived BOOLEAN NOT NULL DEFAULT FALSE)` },
    { name: "services", sql: `CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, date TEXT NOT NULL,
        time TEXT, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
        closed_at TIMESTAMPTZ)` },
    { name: "attendance_records", sql: `CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY, service_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
        cell_id INTEGER, method TEXT NOT NULL DEFAULT 'manual',
        check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "first_timers", sql: `CREATE TABLE IF NOT EXISTS first_timers (
        id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        gender TEXT NOT NULL, contact TEXT, invited_by_id INTEGER,
        invited_by_child_id INTEGER, invited_by_teen_id INTEGER,
        service_id INTEGER NOT NULL, is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        is_registration_error BOOLEAN NOT NULL DEFAULT FALSE, archive_reason TEXT,
        archived_at TIMESTAMPTZ, archived_by INTEGER, is_returning BOOLEAN NOT NULL DEFAULT FALSE,
        residence TEXT, born_again BOOLEAN, marital_status TEXT, prayer_request TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "departments", sql: `CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, head_id INTEGER,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE, archive_reason TEXT)` },
    { name: "department_members", sql: `CREATE TABLE IF NOT EXISTS department_members (
        id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
        sub_unit TEXT, is_head BOOLEAN NOT NULL DEFAULT FALSE)` },
    { name: "children", sql: `CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        gender TEXT, date_of_birth TEXT, class TEXT NOT NULL, parent_id INTEGER,
        parent_external TEXT, is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        archive_reason TEXT)` },
    { name: "teens", sql: `CREATE TABLE IF NOT EXISTS teens (
        id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        gender TEXT, phone1 TEXT, phone2 TEXT, residential_address TEXT,
        date_joined TEXT, foundation_school_completed BOOLEAN,
        foundation_school_date TEXT, date_of_birth TEXT, parent_id INTEGER,
        parent_external TEXT, transferred_from_child_id INTEGER,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE, archive_reason TEXT)` },
    { name: "families", sql: `CREATE TABLE IF NOT EXISTS families (
        id SERIAL PRIMARY KEY, head_id INTEGER, spouse_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "family_children", sql: `CREATE TABLE IF NOT EXISTS family_children (
        id SERIAL PRIMARY KEY, family_id INTEGER NOT NULL, child_id INTEGER,
        teen_id INTEGER, member_id INTEGER, type TEXT NOT NULL)` },
    { name: "ministry_years", sql: `CREATE TABLE IF NOT EXISTS ministry_years (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL,
        end_date TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT FALSE,
        is_closed BOOLEAN NOT NULL DEFAULT FALSE)` },
    { name: "giving_types", sql: `CREATE TABLE IF NOT EXISTS giving_types (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT)` },
    { name: "givings", sql: `CREATE TABLE IF NOT EXISTS givings (
        id SERIAL PRIMARY KEY, member_id INTEGER, teen_id INTEGER, child_id INTEGER,
        first_timer_id INTEGER, person_name TEXT, giving_type_id INTEGER NOT NULL,
        amount TEXT NOT NULL, date TEXT NOT NULL, ministry_year_id INTEGER NOT NULL,
        notes TEXT, recorded_by INTEGER, is_archived BOOLEAN NOT NULL DEFAULT FALSE)` },
    { name: "videos", sql: `CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY, title TEXT NOT NULL, youtube_id TEXT NOT NULL,
        embed_url TEXT, date TEXT NOT NULL, is_live BOOLEAN NOT NULL DEFAULT FALSE,
        live_ended BOOLEAN NOT NULL DEFAULT FALSE, live_started_at TIMESTAMPTZ,
        is_restricted BOOLEAN NOT NULL DEFAULT FALSE, description TEXT,
        added_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "video_chats", sql: `CREATE TABLE IF NOT EXISTS video_chats (
        id SERIAL PRIMARY KEY, video_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
        member_id INTEGER, sender_label TEXT, message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "video_access", sql: `CREATE TABLE IF NOT EXISTS video_access (
        id SERIAL PRIMARY KEY, video_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), granted_by INTEGER)` },
    { name: "video_access_requests", sql: `CREATE TABLE IF NOT EXISTS video_access_requests (
        id SERIAL PRIMARY KEY, video_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT)` },
    { name: "video_watchers", sql: `CREATE TABLE IF NOT EXISTS video_watchers (
        id SERIAL PRIMARY KEY, video_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_ping TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "video_watcher_sessions", sql: `CREATE TABLE IF NOT EXISTS video_watcher_sessions (
        id SERIAL PRIMARY KEY, video_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), left_at TIMESTAMPTZ)` },
    { name: "online_meetings", sql: `CREATE TABLE IF NOT EXISTS online_meetings (
        id SERIAL PRIMARY KEY, title TEXT NOT NULL, room_code TEXT NOT NULL UNIQUE,
        hms_room_id TEXT, description TEXT, scheduled_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        restriction_off BOOLEAN NOT NULL DEFAULT FALSE,
        meeting_type TEXT NOT NULL DEFAULT 'open',
        allowed_member_ids TEXT NOT NULL DEFAULT '[]',
        restricted_groups TEXT DEFAULT '{}', created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ended_at TIMESTAMPTZ)` },
    { name: "meeting_attendance", sql: `CREATE TABLE IF NOT EXISTS meeting_attendance (
        id SERIAL PRIMARY KEY, meeting_id INTEGER NOT NULL, member_id INTEGER,
        guest_name TEXT, is_guest BOOLEAN NOT NULL DEFAULT FALSE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), left_at TIMESTAMPTZ)` },
    { name: "meeting_admins", sql: `CREATE TABLE IF NOT EXISTS meeting_admins (
        id SERIAL PRIMARY KEY, meeting_id INTEGER NOT NULL, member_id INTEGER NOT NULL)` },
    { name: "service_children_attendance", sql: `CREATE TABLE IF NOT EXISTS service_children_attendance (
        id SERIAL PRIMARY KEY, service_id INTEGER NOT NULL, child_id INTEGER NOT NULL,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "service_teens_attendance", sql: `CREATE TABLE IF NOT EXISTS service_teens_attendance (
        id SERIAL PRIMARY KEY, service_id INTEGER NOT NULL, teen_id INTEGER NOT NULL,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "announcements", sql: `CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'general', target_member_id INTEGER,
        emoji TEXT NOT NULL DEFAULT '📢', created_by INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE)` },
    { name: "prayer_requests", sql: `CREATE TABLE IF NOT EXISTS prayer_requests (
        id SERIAL PRIMARY KEY, member_id INTEGER, member_name TEXT,
        request TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        prayed_note TEXT, prayed_at TIMESTAMPTZ, prayed_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "announcement_reads", sql: `CREATE TABLE IF NOT EXISTS announcement_reads (
        id SERIAL PRIMARY KEY, announcement_id INTEGER NOT NULL,
        member_id INTEGER NOT NULL, read_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "meeting_participants", sql: `CREATE TABLE IF NOT EXISTS meeting_participants (
        id SERIAL PRIMARY KEY, meeting_id INTEGER NOT NULL, peer_id TEXT NOT NULL,
        display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
        is_muted BOOLEAN NOT NULL DEFAULT FALSE, is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_ping TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        left_at TIMESTAMPTZ, member_id INTEGER)` },
    { name: "meeting_signals", sql: `CREATE TABLE IF NOT EXISTS meeting_signals (
        id SERIAL PRIMARY KEY, meeting_id INTEGER NOT NULL, from_peer TEXT NOT NULL,
        to_peer TEXT NOT NULL, signal_type TEXT NOT NULL, payload TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "meeting_messages", sql: `CREATE TABLE IF NOT EXISTS meeting_messages (
        id SERIAL PRIMARY KEY, meeting_id INTEGER NOT NULL, peer_id TEXT NOT NULL,
        sender_name TEXT NOT NULL, content TEXT NOT NULL,
        msg_type TEXT NOT NULL DEFAULT 'chat', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
    { name: "meeting_join_requests", sql: `CREATE TABLE IF NOT EXISTS meeting_join_requests (
        id SERIAL PRIMARY KEY, meeting_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (meeting_id, member_id))` },
  ];

  for (const step of steps) {
    try {
      await db.execute(sql.raw(step.sql));
    } catch (err: any) {
      logger.warn({ table: step.name, err: err?.message }, "ensureTables: non-fatal table warning");
    }
  }

  // Indexes — non-fatal if they fail (tables might not exist yet on first run)
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON meeting_participants(meeting_id)",
    "CREATE INDEX IF NOT EXISTS idx_meeting_participants_member_id ON meeting_participants(member_id) WHERE member_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_online_meetings_ended_active ON online_meetings(is_active, ended_at)",
    "CREATE INDEX IF NOT EXISTS idx_meeting_signals_meeting_peer ON meeting_signals(meeting_id, to_peer, id)",
  ];
  for (const idx of indexes) {
    try { await db.execute(sql.raw(idx)); } catch { }
  }
}
ensureTables();

// ── Middleware ────────────────────────────────────────────────────────────────

// Disable compression for SSE streams — gzip buffering breaks real-time push
app.use(compression({
  filter: (req, res) => {
    if (req.headers.accept?.includes("text/event-stream")) return false;
    if (req.path.includes("/stream")) return false;
    return compression.filter(req, res);
  },
}));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Real-time conference polling paths that must never be rate-limited
function isConferencePoll(path: string): boolean {
  // /conference/:id/signals/:peer, /conference/:id/participants,
  // /conference/:id/messages, /conference/:id/ping,
  // /meetings/:id/join-requests
  return /^\/conference\/\d+\/(signals|participants|messages|ping|stream)/.test(path)
      || /^\/meetings\/\d+\/join-requests/.test(path)
      || /^\/online-meetings/.test(path);
}

// Rate limiting — generous limits suitable for a 500-user church app
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => {
    if (req.method === "GET" && req.path.startsWith("/assets")) return true;
    if (isConferencePoll(req.path)) return true;
    return false;
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Static Frontend ───────────────────────────────────────────────────────────
const frontendDist = path.resolve(__dirname, "../../church-portal/dist/public");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    maxAge: "1d",
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send("API server running. Frontend not built yet.");
  });
}

export default app;
