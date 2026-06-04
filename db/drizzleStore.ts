// ============================================================================
// DrizzleStore — the REAL persistence layer behind DataStore.
//
// One implementation, two homes:
//   - prod: a Neon-http Drizzle handle (db/client.ts, when DATABASE_URL is set)
//   - tests: a PGlite-backed Drizzle handle (same query-builder API)
//
// The handle is INJECTED (constructor arg) so the identical code path runs on
// both drivers. We never re-implement scoring in SQL: rows are loaded and the
// pure functions in lib/scoring.ts do the math, so results are byte-identical
// to MockStore. The derived leaderboard tables are rebuilt (DELETE+INSERT) on
// each leaderboard read so that the *previous* ranks survive for climb-delta.
//
// The CRITICAL invariant — savePredictions REJECTS any pick where
// now >= match.kickoff — is enforced HERE, server-side, regardless of caller.
// ============================================================================

import { eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";

import type {
  Department,
  User,
  Match,
  Prediction,
  Result,
  Outcome,
  Stage,
  MatchStatus,
  LeaderboardRow,
  DepartmentStanding,
  Consensus,
} from "../lib/types";
import {
  recomputeLeaderboards,
  computeConsensus,
  resolveResult,
} from "../lib/scoring";
import type {
  DataStore,
  SavePredictionInput,
  SavePredictionsResult,
  CreateUserResult,
  SyncStatus,
} from "../lib/data";
import {
  DEPARTMENTS,
  SEED_MATCHES,
  DYNAMIC_DEPARTMENT_COLORS,
  MAX_DEPARTMENT_NAME_LEN,
  slugify,
  hasKnownTeams,
} from "../lib/seed";
import * as schema from "./schema";

// A Drizzle pg database handle, agnostic to the underlying driver
// (neon-http in prod, PGlite in tests). Both expose the same query builder.
export type DrizzleDb = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

const SYNC_ID = "singleton";

// ---- row -> domain mappers (DB rows carry Date / nullable shapes) ----------

function toMatch(row: typeof schema.matches.$inferSelect): Match {
  return {
    id: row.id,
    stage: row.stage as Stage,
    group: row.group,
    home: row.home,
    away: row.away,
    kickoff: row.kickoff.toISOString(),
    status: row.status as MatchStatus,
    externalRef: row.externalRef,
  };
}

function toUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    displayName: row.displayName,
    departmentId: row.departmentId,
    tokenHash: row.tokenHash,
    isOrganizer: row.isOrganizer,
    joinedAt: row.joinedAt.toISOString(),
  };
}

function toDepartment(row: typeof schema.departments.$inferSelect): Department {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
  };
}

function toPrediction(
  row: typeof schema.predictions.$inferSelect,
): Prediction {
  return {
    id: row.id,
    userId: row.userId,
    matchId: row.matchId,
    pick: row.pick as Outcome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toResult(row: typeof schema.results.$inferSelect): Result {
  return {
    matchId: row.matchId,
    outcome: row.outcome as Outcome,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------

export class DrizzleStore implements DataStore {
  private idCounter = 0;

  constructor(private readonly db: DrizzleDb) {}

  /** Test/clock seam: a single place that decides "now". */
  protected now(): Date {
    return new Date();
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    // Time + counter + randomness keeps ids unique across processes/restarts.
    return `${prefix}-${Date.now().toString(36)}-${this.idCounter.toString(
      36,
    )}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private isLocked(kickoff: Date): boolean {
    return this.now().getTime() >= kickoff.getTime();
  }

  /** Map a match's wall-clock + result presence into its display status. */
  private statusFor(kickoff: Date, hasResult: boolean): MatchStatus {
    if (hasResult) return "final";
    return this.isLocked(kickoff) ? "locked" : "scheduled";
  }

  // -- seeding ---------------------------------------------------------------

  async seedFromOpenfootball(): Promise<void> {
    // Idempotent: if fixtures already exist, do nothing. Seeds the five lanes
    // and the REAL openfootball 2026 schedule (104 future-dated fixtures from
    // SEED_MATCHES). No demo snapshot here — the faked past kickoffs + results
    // are mock-only demo sugar gated behind SEED_DEMO=1.
    const existing = await this.db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .limit(1);
    if (existing.length > 0) return;

    await this.db
      .insert(schema.departments)
      .values(DEPARTMENTS.map((d) => ({ ...d })))
      .onConflictDoNothing();

    await this.db.insert(schema.matches).values(
      SEED_MATCHES.map((m) => ({
        id: m.id,
        stage: m.stage,
        group: m.group,
        home: m.home,
        away: m.away,
        kickoff: new Date(m.kickoff),
        status: m.status,
        externalRef: m.externalRef,
      })),
    );

    // Ensure the single sync_state row exists.
    await this.db
      .insert(schema.syncState)
      .values({ id: SYNC_ID })
      .onConflictDoNothing();
  }

  // -- reads -----------------------------------------------------------------

  async getDepartments(): Promise<Department[]> {
    const rows = await this.db.select().from(schema.departments);
    return rows.map(toDepartment);
  }

  private async resultMatchIds(): Promise<Set<string>> {
    const rows = await this.db
      .select({ matchId: schema.results.matchId })
      .from(schema.results);
    return new Set(rows.map((r) => r.matchId));
  }

  async getMatches(): Promise<Match[]> {
    const [rows, resolved] = await Promise.all([
      this.db.select().from(schema.matches),
      this.resultMatchIds(),
    ]);
    return rows
      .map((row) => {
        const m = toMatch(row);
        m.status = this.statusFor(row.kickoff, resolved.has(row.id));
        return m;
      })
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }

  async getMatchday(): Promise<Match[]> {
    // The "next open matchday": the earliest calendar day that still has an
    // unlocked match, returned as that day's open matches.
    const all = await this.getMatches();
    const open = all.filter((m) => m.status === "scheduled");
    if (open.length === 0) return [];
    const firstDay = open[0]!.kickoff.slice(0, 10);
    return open.filter((m) => m.kickoff.slice(0, 10) === firstDay);
  }

  async getPredictableMatches(): Promise<Match[]> {
    // Every match still open (now < kickoff) whose teams are both real — not
    // locked and not an unresolved KO placeholder. getMatches sorts by kickoff
    // and stamps status against the live clock.
    const all = await this.getMatches();
    return all.filter((m) => m.status === "scheduled" && hasKnownTeams(m));
  }

  async getUser(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async getUserByToken(tokenHash: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async getPredictionsForUser(userId: string): Promise<Prediction[]> {
    const rows = await this.db
      .select()
      .from(schema.predictions)
      .where(eq(schema.predictions.userId, userId));
    return rows.map(toPrediction);
  }

  async getResults(): Promise<Result[]> {
    const rows = await this.db.select().from(schema.results);
    return rows.map(toResult);
  }

  // -- writes: departments + users -------------------------------------------

  async createDepartment(name: string): Promise<Department> {
    const slug = slugify(name);
    // Idempotent on slug: an existing department with the same slug wins.
    const existing = await this.db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.slug, slug))
      .limit(1);
    if (existing[0]) return toDepartment(existing[0]);

    const count = (
      await this.db.select({ id: schema.departments.id }).from(schema.departments)
    ).length;
    const color =
      DYNAMIC_DEPARTMENT_COLORS[count % DYNAMIC_DEPARTMENT_COLORS.length]!;
    const dept: Department = {
      id: `dept-${slug}`,
      name: name.trim(),
      slug,
      color,
    };
    // onConflictDoNothing guards the rare race where two joiners add the same
    // new lane at once; then re-read to return the winner.
    await this.db
      .insert(schema.departments)
      .values(dept)
      .onConflictDoNothing();
    const row = (
      await this.db
        .select()
        .from(schema.departments)
        .where(eq(schema.departments.slug, slug))
        .limit(1)
    )[0];
    return row ? toDepartment(row) : dept;
  }

  async getOrCreateDepartmentByName(idOrName: string): Promise<Department> {
    const trimmed = idOrName.trim();
    const slug = slugify(trimmed);
    const all = await this.db.select().from(schema.departments);
    const found = all.find(
      (d) =>
        d.id === trimmed ||
        d.slug === slug ||
        d.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (found) return toDepartment(found);
    // A brand-new typed name: cap length and reject empty/slug-less input
    // store-side (defense in depth — the action layer also validates).
    if (trimmed.length === 0 || trimmed.length > MAX_DEPARTMENT_NAME_LEN || slug.length === 0) {
      throw new Error("INVALID_DEPARTMENT");
    }
    return this.createDepartment(trimmed);
  }

  async nameTakenInDepartment(
    displayName: string,
    departmentId: string,
  ): Promise<boolean> {
    const norm = displayName.trim().toLowerCase();
    const rows = await this.db
      .select({ name: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.departmentId, departmentId));
    return rows.some((r) => r.name.trim().toLowerCase() === norm);
  }

  async createUser(
    displayName: string,
    department: string,
  ): Promise<CreateUserResult> {
    // `department` may be an existing id/name OR a brand-new name — resolve it,
    // creating the department on the fly when it's new (dynamic departments).
    const dept = await this.getOrCreateDepartmentByName(department);
    // Lazy import keeps auth (server-only) out of any client bundle.
    const { generateCode, hashToken } = await import("../lib/auth");
    const code = generateCode();
    const tokenHash = await hashToken(code);
    const user: User = {
      id: this.nextId("user"),
      displayName,
      departmentId: dept.id,
      tokenHash,
      isOrganizer: false,
      joinedAt: this.now().toISOString(),
    };
    await this.db.insert(schema.users).values({
      id: user.id,
      displayName: user.displayName,
      departmentId: user.departmentId,
      tokenHash: user.tokenHash,
      isOrganizer: user.isOrganizer,
      joinedAt: new Date(user.joinedAt),
    });
    return { user, code };
  }

  async deleteUser(userId: string): Promise<void> {
    // GDPR erasure: hard-DELETE the user's predictions, their persisted
    // leaderboard row, then the user. The FK cascades would handle the children,
    // but we delete them explicitly so the contract holds on any driver and the
    // intent is unambiguous. Leaderboards/consensus recompute from raw rows on
    // the next read, so the user disappears from the board too.
    await this.db
      .delete(schema.predictions)
      .where(eq(schema.predictions.userId, userId));
    await this.db
      .delete(schema.leaderboardUser)
      .where(eq(schema.leaderboardUser.userId, userId));
    await this.db.delete(schema.users).where(eq(schema.users.id, userId));
  }

  // -- writes: predictions (server-side lock + UNIQUE upsert) ----------------

  async savePredictions(
    userId: string,
    picks: SavePredictionInput[],
  ): Promise<SavePredictionsResult> {
    const rejectedLocked: string[] = [];
    let saved = 0;
    const now = this.now();

    if (picks.length === 0) return { saved, rejectedLocked };

    // Load only the matches referenced by this batch.
    const ids = [...new Set(picks.map((p) => p.matchId))];
    const matchRows = await this.db
      .select({
        id: schema.matches.id,
        kickoff: schema.matches.kickoff,
        stage: schema.matches.stage,
        home: schema.matches.home,
        away: schema.matches.away,
      })
      .from(schema.matches)
      .where(inArray(schema.matches.id, ids));
    const matchById = new Map(matchRows.map((m) => [m.id, m]));

    for (const pick of picks) {
      const match = matchById.get(pick.matchId);
      if (!match) {
        rejectedLocked.push(pick.matchId); // unknown match: treat as rejected
        continue;
      }
      if (this.isLocked(match.kickoff)) {
        rejectedLocked.push(pick.matchId); // SERVER-SIDE LOCK
        continue;
      }
      // SEMANTIC GATE (server-side truth, does not trust the UI):
      //   - a 'draw' is only valid in the GROUP stage; knockouts always resolve.
      //   - a match with an unresolved/placeholder team is NOT predictable yet.
      // Either makes the pick invalid -> rejected via the same channel, never saved.
      if (pick.pick === "draw" && (match.stage as Stage) !== "group") {
        rejectedLocked.push(pick.matchId);
        continue;
      }
      if (!hasKnownTeams({ home: match.home, away: match.away })) {
        rejectedLocked.push(pick.matchId);
        continue;
      }
      // Upsert on UNIQUE(user_id, match_id): a second pick overwrites, never
      // duplicates. updated_at advances; created_at stays put.
      await this.db
        .insert(schema.predictions)
        .values({
          id: this.nextId("pred"),
          userId,
          matchId: pick.matchId,
          pick: pick.pick,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.predictions.userId, schema.predictions.matchId],
          set: { pick: pick.pick, updatedAt: now },
        });
      saved += 1;
    }
    return { saved, rejectedLocked };
  }

  // -- writes: results (feed / organizer-override precedence) ----------------

  private async upsertResult(incoming: Result): Promise<Result> {
    const existing = (
      await this.db
        .select()
        .from(schema.results)
        .where(eq(schema.results.matchId, incoming.matchId))
        .limit(1)
    )[0];
    const winner =
      incoming.source === "organizer"
        ? incoming // organizer always wins
        : resolveResult(incoming, existing ? toResult(existing) : null)!;

    await this.db
      .insert(schema.results)
      .values({
        matchId: winner.matchId,
        outcome: winner.outcome,
        source: winner.source,
        updatedAt: new Date(winner.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.results.matchId,
        set: {
          outcome: winner.outcome,
          source: winner.source,
          updatedAt: new Date(winner.updatedAt),
        },
      });
    return winner;
  }

  async setResult(matchId: string, outcome: Outcome): Promise<Result> {
    // Organizer OVERRIDE — always stamps source 'organizer', which wins.
    await this.assertMatchExists(matchId);
    return this.upsertResult({
      matchId,
      outcome,
      source: "organizer",
      updatedAt: this.now().toISOString(),
    });
  }

  async recordFeedResult(matchId: string, outcome: Outcome): Promise<Result> {
    // AUTHORITATIVE feed ingest. Idempotent and override-safe: an existing
    // organizer result wins and is left untouched (resolveResult precedence).
    await this.assertMatchExists(matchId);
    return this.upsertResult({
      matchId,
      outcome,
      source: "feed",
      updatedAt: this.now().toISOString(),
    });
  }

  private async assertMatchExists(matchId: string): Promise<void> {
    const rows = await this.db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .limit(1);
    if (!rows[0]) throw new Error(`Unknown match: ${matchId}`);
  }

  // -- derived: leaderboards (persisted so previous ranks feed climb-delta) --

  private async loadRecomputeInputs() {
    const [userRows, predRows, resultRows, matchRows, deptRows] =
      await Promise.all([
        this.db.select().from(schema.users),
        this.db.select().from(schema.predictions),
        this.db.select().from(schema.results),
        this.db.select().from(schema.matches),
        this.db.select().from(schema.departments),
      ]);
    const matchStages: Record<string, Stage> = {};
    for (const m of matchRows) matchStages[m.id] = m.stage as Stage;
    return {
      users: userRows.map(toUser),
      predictions: predRows.map(toPrediction),
      results: resultRows.map(toResult),
      departments: deptRows.map(toDepartment),
      matchStages,
    };
  }

  /**
   * Recompute both leaderboards from raw rows (reusing the pure scoring engine),
   * persist ONLY the requested derived table, and return the fresh rows. The
   * PRIOR persisted ranks become the `previous` snapshot so climb-delta is real
   * across calls. We persist a single dimension per read — mirroring MockStore,
   * so the two derived tables track movement independently (a leaderboard read
   * doesn't reset the department climb-delta, and vice-versa).
   */
  private async recomputeAndPersist(dimension: "user" | "department") {
    const inputs = await this.loadRecomputeInputs();

    // Snapshot the previously-persisted ranks BEFORE we overwrite them.
    const [prevUsers, prevDepts] = await Promise.all([
      this.db
        .select({
          userId: schema.leaderboardUser.userId,
          rank: schema.leaderboardUser.rank,
        })
        .from(schema.leaderboardUser),
      this.db
        .select({
          departmentId: schema.leaderboardDepartment.departmentId,
          rank: schema.leaderboardDepartment.rank,
        })
        .from(schema.leaderboardDepartment),
    ]);
    const previous = {
      users: Object.fromEntries(prevUsers.map((r) => [r.userId, r.rank])),
      departments: Object.fromEntries(
        prevDepts.map((r) => [r.departmentId, r.rank]),
      ),
    };

    const { leaderboard, departments } = recomputeLeaderboards({
      ...inputs,
      previous,
    });

    // Rebuild only the requested derived table idempotently (DELETE + INSERT).
    const computedAt = this.now();
    if (dimension === "user") {
      await this.db.delete(schema.leaderboardUser);
      if (leaderboard.length > 0) {
        await this.db.insert(schema.leaderboardUser).values(
          leaderboard.map((r) => ({
            userId: r.userId,
            points: r.points,
            rank: r.rank,
            percentile: r.percentile,
            climbDelta: r.climbDelta,
            computedAt,
          })),
        );
      }
    } else {
      await this.db.delete(schema.leaderboardDepartment);
      if (departments.length > 0) {
        await this.db.insert(schema.leaderboardDepartment).values(
          departments.map((d) => ({
            departmentId: d.departmentId,
            avgPoints: d.avgPoints,
            memberCount: d.activeMembers,
            rank: d.rank,
            climbDelta: d.climbDelta,
            eligible: d.eligible,
            computedAt,
          })),
        );
      }
    }

    return { leaderboard, departments };
  }

  async getLeaderboard(): Promise<LeaderboardRow[]> {
    const { leaderboard } = await this.recomputeAndPersist("user");
    return leaderboard;
  }

  async getDepartmentStandings(): Promise<DepartmentStanding[]> {
    const { departments } = await this.recomputeAndPersist("department");
    return departments;
  }

  async getConsensus(matchId: string): Promise<Consensus> {
    const rows = await this.db
      .select()
      .from(schema.predictions)
      .where(eq(schema.predictions.matchId, matchId));
    return computeConsensus(matchId, rows.map(toPrediction));
  }

  // -- sync heartbeat --------------------------------------------------------

  async getSyncStatus(): Promise<SyncStatus> {
    const [stateRow, feedRows] = await Promise.all([
      this.db
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.id, SYNC_ID))
        .limit(1),
      this.db
        .select({ matchId: schema.results.matchId })
        .from(schema.results)
        .where(eq(schema.results.source, "feed")),
    ]);
    const state = stateRow[0];
    return {
      lastSyncAt: state?.lastSyncAt ? state.lastSyncAt.toISOString() : null,
      lastSyncNote: state?.lastSyncNote ?? null,
      feedResultCount: feedRows.length,
    };
  }

  async markSync(note?: string): Promise<void> {
    const now = this.now();
    await this.db
      .insert(schema.syncState)
      .values({ id: SYNC_ID, lastSyncAt: now, lastSyncNote: note ?? null })
      .onConflictDoUpdate({
        target: schema.syncState.id,
        set: { lastSyncAt: now, lastSyncNote: note ?? null },
      });
  }

  async setMatchTeams(
    matchId: string,
    home: string,
    away: string,
  ): Promise<Match> {
    // Overwrite a KO match's placeholder teams with the resolved real teams.
    await this.assertMatchExists(matchId);
    await this.db
      .update(schema.matches)
      .set({ home, away })
      .where(eq(schema.matches.id, matchId));
    const row = (
      await this.db
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId))
        .limit(1)
    )[0]!;
    return toMatch(row);
  }
}
