-- Performance indexes for 500-user scale
-- Run this once on your production database:
--   psql $DATABASE_URL -f 0001_performance_indexes.sql
--
-- Every index uses IF NOT EXISTS so it is safe to run multiple times.
-- Expected runtime: < 30 seconds on a database with typical church data.

-- ── Meeting signals ───────────────────────────────────────────────────────────
-- Hot path: polled every 2.5 s per user in a meeting
-- Query shape: WHERE meeting_id=X AND (to_peer=Y OR to_peer='__broadcast__') AND id>Z
CREATE INDEX IF NOT EXISTS idx_meeting_signals_lookup
  ON meeting_signals (meeting_id, to_peer, id);

-- Used by the auto-cleanup that prunes signals older than 2 hours
CREATE INDEX IF NOT EXISTS idx_meeting_signals_created_at
  ON meeting_signals (meeting_id, created_at);

-- ── Meeting participants ──────────────────────────────────────────────────────
-- Polled every 6 s: WHERE meeting_id=X AND left_at IS NULL
CREATE INDEX IF NOT EXISTS idx_meeting_participants_active
  ON meeting_participants (meeting_id, left_at);

-- Ping / heartbeat: WHERE meeting_id=X AND peer_id=Y AND left_at IS NULL
CREATE INDEX IF NOT EXISTS idx_meeting_participants_peer
  ON meeting_participants (meeting_id, peer_id, left_at);

-- ── Meeting messages ──────────────────────────────────────────────────────────
-- Polled every 4 s: WHERE meeting_id=X AND id>Z ORDER BY id
CREATE INDEX IF NOT EXISTS idx_meeting_messages_lookup
  ON meeting_messages (meeting_id, id);

-- ── Attendance ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_service
  ON attendance_records (service_id);

CREATE INDEX IF NOT EXISTS idx_service_children_service
  ON service_children_attendance (service_id);

CREATE INDEX IF NOT EXISTS idx_service_teens_service
  ON service_teens_attendance (service_id);

-- ── Members ───────────────────────────────────────────────────────────────────
-- Nearly every member query filters by cell or archive status
CREATE INDEX IF NOT EXISTS idx_members_cell
  ON members (cell_id);

CREATE INDEX IF NOT EXISTS idx_members_archived
  ON members (is_archived);

-- ── Financials ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_givings_year_member
  ON givings (ministry_year_id, member_id);

-- ── Live video ────────────────────────────────────────────────────────────────
-- Viewer-count query: WHERE video_id=X AND last_ping > now() - interval '15 seconds'
CREATE INDEX IF NOT EXISTS idx_video_watchers_ping
  ON video_watchers (video_id, last_ping);

-- ── Activity log ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_log_created
  ON activity_log (created_at DESC);

-- ── Announcements ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_announcement_reads_member
  ON announcement_reads (announcement_id, member_id);
