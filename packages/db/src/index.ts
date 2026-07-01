import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  pgTable, serial, text, integer, boolean, timestamp, numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, {
  max: 40,              // was 5 — supports 500 concurrent users
  idle_timeout: 30,     // keep idle connections a bit longer to avoid reconnect cost
  max_lifetime: 1800,   // 30 min — prevent stale connections
  connect_timeout: 10,
});
export const db = drizzle(client);
export const closeDb = () => client.end();

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleLevel: integer("role_level").notNull().default(5),
  roleSubtype: text("role_subtype"),
  memberId: integer("member_id"),
  isActive: boolean("is_active").notNull().default(true),
});

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  membershipId: text("membership_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender").notNull(),
  phone1: text("phone1").notNull(),
  phone2: text("phone2"),
  email: text("email"),
  occupation: text("occupation").notNull().default(""),
  residentialAddress: text("residential_address").notNull().default(""),
  emergencyContact: text("emergency_contact").notNull().default(""),
  dateOfBirth: text("date_of_birth"),
  maritalStatus: text("marital_status"),
  dateJoined: text("date_joined"),
  foundationSchoolDate: text("foundation_school_date"),
  weddingDate: text("wedding_date"),
  isBaptized: boolean("is_baptized").notNull().default(false),
  title: text("title"),
  memberType: text("member_type").notNull().default("member"),
  cellId: integer("cell_id"),
  spouseId: integer("spouse_id"),
  profilePhoto: text("profile_photo"),
  pin: text("pin").notNull().default("0000"),
  isArchived: boolean("is_archived").notNull().default(false),
  archiveReason: text("archive_reason"),
  archivedAt: timestamp("archived_at"),
  archivedBy: integer("archived_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  transferredFromTeenId: integer("transferred_from_teen_id"),
});

export const leadershipRolesTable = pgTable("leadership_roles", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull(),
  role: text("role").notNull(),
});

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  memberId: integer("member_id"),
  memberName: text("member_name"),
  performedByName: text("performed_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pcfsTable = pgTable("pcfs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  leaderId: integer("leader_id"),
  isArchived: boolean("is_archived").notNull().default(false),
});

export const seniorCellsTable = pgTable("senior_cells", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  leaderId: integer("leader_id"),
  pcfId: integer("pcf_id"),
  isArchived: boolean("is_archived").notNull().default(false),
});

export const cellsTable = pgTable("cells", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  leaderId: integer("leader_id"),
  seniorCellId: integer("senior_cell_id"),
  isArchived: boolean("is_archived").notNull().default(false),
});

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  time: text("time"),
  type: text("type").notNull(),
  status: text("status").notNull().default("open"),
  closedAt: timestamp("closed_at"),
});

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull(),
  memberId: integer("member_id").notNull(),
  cellId: integer("cell_id"),
  method: text("method").notNull().default("manual"),
  checkInTime: timestamp("check_in_time").notNull().defaultNow(),
});

export const firstTimersTable = pgTable("first_timers", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender").notNull(),
  contact: text("contact"),
  invitedById: integer("invited_by_id"),
  invitedByChildId: integer("invited_by_child_id"),
  invitedByTeenId: integer("invited_by_teen_id"),
  serviceId: integer("service_id").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  isRegistrationError: boolean("is_registration_error").notNull().default(false),
  archiveReason: text("archive_reason"),
  archivedAt: timestamp("archived_at"),
  archivedBy: integer("archived_by"),
  isReturning: boolean("is_returning").notNull().default(false),
  residence: text("residence"),
  bornAgain: boolean("born_again"),
  maritalStatus: text("marital_status"),
  prayerRequest: text("prayer_request"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  headId: integer("head_id"),
  isArchived: boolean("is_archived").notNull().default(false),
  archiveReason: text("archive_reason"),
});

export const departmentMembersTable = pgTable("department_members", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),
  memberId: integer("member_id").notNull(),
  subUnit: text("sub_unit"),
  isHead: boolean("is_head").notNull().default(false),
});

export const childrenTable = pgTable("children", {
  id: serial("id").primaryKey(),
  membershipId: text("membership_id").unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender"),
  dateOfBirth: text("date_of_birth"),
  class: text("class"),
  parentId: integer("parent_id"),
  parentExternal: text("parent_external"),
  isArchived: boolean("is_archived").notNull().default(false),
  archiveReason: text("archive_reason"),
});

export const teensTable = pgTable("teens", {
  id: serial("id").primaryKey(),
  membershipId: text("membership_id").unique(),
  pin: text("pin").notNull().default("0000"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender"),
  phone1: text("phone1"),
  phone2: text("phone2"),
  residentialAddress: text("residential_address"),
  dateJoined: text("date_joined"),
  foundationSchoolCompleted: boolean("foundation_school_completed"),
  foundationSchoolDate: text("foundation_school_date"),
  dateOfBirth: text("date_of_birth"),
  parentId: integer("parent_id"),
  parentExternal: text("parent_external"),
  transferredFromChildId: integer("transferred_from_child_id"),
  isArchived: boolean("is_archived").notNull().default(false),
  archiveReason: text("archive_reason"),
});

export const familiesTable = pgTable("families", {
  id: serial("id").primaryKey(),
  headId: integer("head_id"),
  spouseId: integer("spouse_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const familyChildrenTable = pgTable("family_children", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull(),
  childId: integer("child_id"),
  teenId: integer("teen_id"),
  memberId: integer("member_id"),
  type: text("type").notNull(),
});

export const ministryYearsTable = pgTable("ministry_years", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  isClosed: boolean("is_closed").notNull().default(false),
});

export const givingTypesTable = pgTable("giving_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const givingsTable = pgTable("givings", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id"),
  teenId: integer("teen_id"),
  childId: integer("child_id"),
  firstTimerId: integer("first_timer_id"),
  personName: text("person_name"),
  givingTypeId: integer("giving_type_id").notNull(),
  amount: text("amount").notNull(),
  date: text("date").notNull(),
  ministryYearId: integer("ministry_year_id").notNull(),
  notes: text("notes"),
  recordedBy: integer("recorded_by"),
  isArchived: boolean("is_archived").notNull().default(false),
});

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  youtubeId: text("youtube_id").notNull(),
  embedUrl: text("embed_url"),
  date: text("date").notNull(),
  isLive: boolean("is_live").notNull().default(false),
  liveEnded: boolean("live_ended").notNull().default(false),
  liveStartedAt: timestamp("live_started_at"),
  isRestricted: boolean("is_restricted").notNull().default(false),
  description: text("description"),
  addedBy: integer("added_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const videoChatsTable = pgTable("video_chats", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  userId: integer("user_id").notNull(),
  memberId: integer("member_id"),
  senderLabel: text("sender_label"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const videoAccessTable = pgTable("video_access", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  memberId: integer("member_id").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  grantedBy: integer("granted_by"),
});

export const videoAccessRequestsTable = pgTable("video_access_requests", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  memberId: integer("member_id").notNull(),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
});

export const videoWatchersTable = pgTable("video_watchers", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  memberId: integer("member_id").notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastPing: timestamp("last_ping").notNull().defaultNow(),
});

export const videoWatcherSessionsTable = pgTable("video_watcher_sessions", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  memberId: integer("member_id").notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
});

export const onlineMeetingsTable = pgTable("online_meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  roomCode: text("room_code").notNull().unique(),
  hmsRoomId: text("hms_room_id"),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at"),
  isActive: boolean("is_active").notNull().default(false),
  restrictionOff: boolean("restriction_off").notNull().default(false),
  meetingType: text("meeting_type").notNull().default("open"),
  allowedMemberIds: text("allowed_member_ids").notNull().default("[]"),
  restrictedGroups: text("restricted_groups").default("{}"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const meetingAttendanceTable = pgTable("meeting_attendance", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  memberId: integer("member_id"),
  guestName: text("guest_name"),
  isGuest: boolean("is_guest").notNull().default(false),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
});

export const meetingAdminsTable = pgTable("meeting_admins", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  memberId: integer("member_id").notNull(),
});

export const serviceChildrenAttendanceTable = pgTable("service_children_attendance", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull(),
  childId: integer("child_id").notNull(),
  registeredAt: timestamp("registered_at").notNull().defaultNow(),
});

export const serviceTeensAttendanceTable = pgTable("service_teens_attendance", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull(),
  teenId: integer("teen_id").notNull(),
  registeredAt: timestamp("registered_at").notNull().defaultNow(),
});

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("general"),
  targetMemberId: integer("target_member_id"),
  emoji: text("emoji").notNull().default("📢"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
});

export const prayerRequestsTable = pgTable("prayer_requests", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id"),
  memberName: text("member_name"),
  request: text("request").notNull(),
  status: text("status").notNull().default("pending"),
  prayedNote: text("prayed_note"),
  prayedAt: timestamp("prayed_at"),
  prayedBy: integer("prayed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const announcementReadsTable = pgTable("announcement_reads", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull(),
  memberId: integer("member_id").notNull(),
  readAt: timestamp("read_at").notNull().defaultNow(),
});

export const meetingParticipantsTable = pgTable("meeting_participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  peerId: text("peer_id").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("member"),
  isMuted: boolean("is_muted").notNull().default(false),
  isPinned: boolean("is_pinned").notNull().default(false),
  joinedAt: timestamp("joined_at").notNull().default(sql`now()`),
  lastPing: timestamp("last_ping").notNull().default(sql`now()`),
  leftAt: timestamp("left_at"),
  memberId: integer("member_id"),
});

export const meetingSignalsTable = pgTable("meeting_signals", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  fromPeer: text("from_peer").notNull(),
  toPeer: text("to_peer").notNull(),
  signalType: text("signal_type").notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const meetingMessagesTable = pgTable("meeting_messages", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  peerId: text("peer_id").notNull(),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  msgType: text("msg_type").notNull().default("chat"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});