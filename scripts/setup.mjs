import postgres from "postgres";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "ce_kumasi_salt").digest("hex");
}

async function setup() {
  console.log("Running database setup...");

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_level INTEGER NOT NULL DEFAULT 5,
      role_subtype TEXT,
      member_id INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      membership_id TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      phone1 TEXT NOT NULL,
      phone2 TEXT,
      email TEXT,
      occupation TEXT NOT NULL DEFAULT '',
      residential_address TEXT NOT NULL DEFAULT '',
      emergency_contact TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT,
      marital_status TEXT,
      date_joined TEXT,
      foundation_school_date TEXT,
      wedding_date TEXT,
      is_baptized BOOLEAN NOT NULL DEFAULT FALSE,
      title TEXT,
      member_type TEXT NOT NULL DEFAULT 'member',
      cell_id INTEGER,
      spouse_id INTEGER,
      profile_photo TEXT,
      pin TEXT NOT NULL DEFAULT '0000',
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      archive_reason TEXT,
      archived_at TIMESTAMP,
      archived_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS leadership_roles (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL,
      role TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      member_id INTEGER,
      member_name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pcfs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      leader_id INTEGER,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS senior_cells (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      leader_id INTEGER,
      pcf_id INTEGER,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cells (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      leader_id INTEGER,
      senior_cell_id INTEGER,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      closed_at TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      cell_id INTEGER,
      method TEXT NOT NULL DEFAULT 'manual',
      check_in_time TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS first_timers (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      contact TEXT,
      invited_by_id INTEGER,
      invited_by_child_id INTEGER,
      invited_by_teen_id INTEGER,
      service_id INTEGER NOT NULL,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      is_registration_error BOOLEAN NOT NULL DEFAULT FALSE,
      archive_reason TEXT,
      archived_at TIMESTAMP,
      archived_by INTEGER,
      is_returning BOOLEAN NOT NULL DEFAULT FALSE,
      residence TEXT,
      born_again BOOLEAN,
      marital_status TEXT,
      prayer_request TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      head_id INTEGER,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      archive_reason TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS department_members (
      id SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      sub_unit TEXT,
      is_head BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS children (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT,
      date_of_birth TEXT,
      class TEXT NOT NULL,
      parent_id INTEGER,
      parent_external TEXT,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      archive_reason TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS teens (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT,
      phone1 TEXT,
      phone2 TEXT,
      residential_address TEXT,
      date_joined TEXT,
      foundation_school_completed BOOLEAN,
      foundation_school_date TEXT,
      date_of_birth TEXT,
      parent_id INTEGER,
      parent_external TEXT,
      transferred_from_child_id INTEGER,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      archive_reason TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS families (
      id SERIAL PRIMARY KEY,
      head_id INTEGER,
      spouse_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS family_children (
      id SERIAL PRIMARY KEY,
      family_id INTEGER NOT NULL,
      child_id INTEGER,
      teen_id INTEGER,
      member_id INTEGER,
      type TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ministry_years (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      is_closed BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS giving_types (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS givings (
      id SERIAL PRIMARY KEY,
      member_id INTEGER,
      teen_id INTEGER,
      child_id INTEGER,
      first_timer_id INTEGER,
      person_name TEXT,
      giving_type_id INTEGER NOT NULL,
      amount TEXT NOT NULL,
      date TEXT NOT NULL,
      ministry_year_id INTEGER NOT NULL,
      notes TEXT,
      recorded_by INTEGER,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      youtube_id TEXT NOT NULL,
      embed_url TEXT,
      date TEXT NOT NULL,
      is_live BOOLEAN NOT NULL DEFAULT FALSE,
      live_ended BOOLEAN NOT NULL DEFAULT FALSE,
      live_started_at TIMESTAMP,
      is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT,
      added_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS video_chats (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      member_id INTEGER,
      sender_label TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS video_access (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      granted_by INTEGER
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS video_access_requests (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS video_watchers (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_ping TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS video_watcher_sessions (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      left_at TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS online_meetings (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      room_code TEXT NOT NULL UNIQUE,
      hms_room_id TEXT,
      description TEXT,
      scheduled_at TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      restriction_off BOOLEAN NOT NULL DEFAULT FALSE,
      meeting_type TEXT NOT NULL DEFAULT 'open',
      allowed_member_ids TEXT NOT NULL DEFAULT '[]',
      restricted_groups TEXT DEFAULT '{}',
      created_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_attendance (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER NOT NULL,
      member_id INTEGER,
      guest_name TEXT,
      is_guest BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      left_at TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_admins (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS service_children_attendance (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      registered_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS service_teens_attendance (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL,
      teen_id INTEGER NOT NULL,
      registered_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'general',
      target_member_id INTEGER,
      emoji TEXT NOT NULL DEFAULT '📢',
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS prayer_requests (
      id SERIAL PRIMARY KEY,
      member_id INTEGER,
      member_name TEXT,
      request TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      prayed_note TEXT,
      prayed_at TIMESTAMP,
      prayed_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS announcement_reads (
      id SERIAL PRIMARY KEY,
      announcement_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      read_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_participants (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER NOT NULL,
      peer_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      is_muted BOOLEAN NOT NULL DEFAULT FALSE,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_ping TIMESTAMP NOT NULL DEFAULT NOW(),
      left_at TIMESTAMP,
      member_id INTEGER
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_signals (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER NOT NULL,
      from_peer TEXT NOT NULL,
      to_peer TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_messages (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER NOT NULL,
      peer_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      msg_type TEXT NOT NULL DEFAULT 'chat',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  console.log("All tables created.");

  const adminHash = hashPassword("@Verification2019");
  const existing = await sql`SELECT id FROM users WHERE username = 'admin@cekumasi1'`;
  if (existing.length === 0) {
    await sql`
      INSERT INTO users (username, password_hash, role_level, is_active)
      VALUES ('admin@cekumasi1', ${adminHash}, 1, TRUE)
    `;
    console.log("Admin user created. Login: admin@cekumasi1 / @Verification2019");
  } else {
    console.log("Admin user already exists.");
  }

  await sql.end();
  console.log("Setup complete.");
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
