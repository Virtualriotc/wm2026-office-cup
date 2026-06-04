// ============================================================================
// Drizzle schema — Neon Postgres. Mirrors lib/types.ts and the rules in
// goal.md §5. Only used when DATABASE_URL is set; the mock store needs none of
// this. The derived tables (leaderboard_user / leaderboard_department /
// office_consensus) are rebuilt idempotently by the recompute (DELETE+INSERT
// in one transaction).
// ============================================================================

import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// --- enums (keep values identical to the string unions in lib/types.ts) ---
export const stageEnum = pgEnum("stage", [
  "group",
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
]);
export const outcomeEnum = pgEnum("outcome", ["home", "draw", "away"]);
export const resultSourceEnum = pgEnum("result_source", ["organizer", "feed"]);
export const matchStatusEnum = pgEnum("match_status", [
  "scheduled",
  "locked",
  "final",
]);

// --- departments ---
export const departments = pgTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  color: text("color").notNull(),
});

// --- users ---
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    // SHA-256 hash of the access code. The plaintext code is never stored.
    tokenHash: text("token_hash").notNull(),
    isOrganizer: boolean("is_organizer").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("users_token_hash_idx").on(t.tokenHash),
    deptIdx: index("users_department_idx").on(t.departmentId),
    // Airtight backstop for the duplicate-name guard: the app-level check
    // (nameTakenInDepartment) is check-then-insert and can lose a millisecond
    // race across Vercel instances, so the DB enforces uniqueness too. Applied
    // to prod manually (CREATE UNIQUE INDEX) since the DB is already migrated.
    nameDeptUnq: uniqueIndex("users_name_dept_unq").on(
      t.departmentId,
      t.displayName,
    ),
  }),
);

// --- matches ---
export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  stage: stageEnum("stage").notNull(),
  group: text("group"), // null for knockouts
  home: text("home").notNull(),
  away: text("away").notNull(),
  // The match locks the instant now() >= kickoff (enforced in app code).
  kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
  status: matchStatusEnum("status").notNull().default("scheduled"),
  externalRef: text("external_ref"),
});

// --- predictions: UNIQUE(user_id, match_id) ---
export const predictions = pgTable(
  "predictions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    pick: outcomeEnum("pick").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userMatchUnq: uniqueIndex("predictions_user_match_unq").on(
      t.userId,
      t.matchId,
    ),
    matchIdx: index("predictions_match_idx").on(t.matchId),
  }),
);

// --- results: one row per resolved match ---
// Source of truth is now the AUTO-INGESTED feed (source 'feed', the default).
// An organizer confirmation (source 'organizer') is an OPTIONAL OVERRIDE that
// always wins when present — see lib/scoring.resolveResult for the precedence.
export const results = pgTable("results", {
  matchId: text("match_id")
    .primaryKey()
    .references(() => matches.id, { onDelete: "cascade" }),
  outcome: outcomeEnum("outcome").notNull(),
  source: resultSourceEnum("source").notNull().default("feed"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- sync state: single-row ingestion heartbeat (DataStore.getSyncStatus) ---
// `id` is a constant ("singleton") so there is exactly one row. Updated after
// every cron sync pass; read by the organizer surface.
export const syncState = pgTable("sync_state", {
  id: text("id").primaryKey().default("singleton"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncNote: text("last_sync_note"),
});

// --- derived: per-user leaderboard (rebuilt each recompute) ---
export const leaderboardUser = pgTable("leaderboard_user", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  rank: integer("rank").notNull(),
  percentile: integer("percentile").notNull(),
  climbDelta: integer("climb_delta").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- derived: per-department standings ---
export const leaderboardDepartment = pgTable("leaderboard_department", {
  departmentId: text("department_id")
    .primaryKey()
    .references(() => departments.id, { onDelete: "cascade" }),
  avgPoints: real("avg_points").notNull().default(0),
  memberCount: integer("member_count").notNull().default(0),
  rank: integer("rank").notNull(),
  climbDelta: integer("climb_delta").notNull().default(0),
  eligible: boolean("eligible").notNull().default(true),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- derived: office consensus per match ---
export const officeConsensus = pgTable(
  "office_consensus",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    pctHome: integer("pct_home").notNull().default(0),
    pctDraw: integer("pct_draw").notNull().default(0),
    pctAway: integer("pct_away").notNull().default(0),
    n: integer("n").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.matchId] }),
  }),
);
