// ============================================================================
// Data access layer — the seam between the app and storage.
//
// `DataStore` is the ONLY contract the app talks to. Two implementations:
//   - MockStore (in-memory): used automatically when DATABASE_URL is UNSET.
//     Seeded by DEFAULT with the REAL openfootball 2026 schedule and NOTHING
//     else (no results, no users) — so the app runs and deploys to Vercel with
//     ZERO setup and, at the real 2026-06-02 clock, shows true upcoming matches
//     with nothing locked. The populated mid-tournament demo (faked-past
//     kickoffs, results, ~12 demo colleagues) is OPT-IN via SEED_DEMO=1. State
//     is per-process and resets on restart — fine for v1 demos.
//   - NeonStore (Drizzle + Neon): used when DATABASE_URL is present. Stubbed
//     here so the wiring is in place; the DB agent fills in the queries.
//
// `getStore()` picks the implementation and memoizes it.
//
// CRITICAL invariant lives in `savePredictions`: it REJECTS any write where
// `now >= match.kickoff`. This is the server-side lock. It is enforced HERE,
// in the store, so it holds no matter which UI or endpoint calls it.
// ============================================================================

import type {
  Department,
  User,
  JerseyParticipant,
  Match,
  Prediction,
  Result,
  Outcome,
  Stage,
  LeaderboardRow,
  DepartmentStanding,
  Consensus,
} from "./types";
import { recomputeLeaderboards, computeConsensus, resolveResult } from "./scoring";
import type { RecomputeOutput } from "./scoring";
import {
  DEPARTMENTS,
  ALL_DEPARTMENT_NAMES,
  DYNAMIC_DEPARTMENT_COLORS,
  SEED_MATCHES,
  MAX_DEPARTMENT_NAME_LEN,
  slugify,
  hasKnownTeams,
} from "./seed";

// Re-exported so existing importers (app/actions/account.ts, UI) keep working.
export { DEPARTMENTS, ALL_DEPARTMENT_NAMES };

// ---------------------------------------------------------------------------
// The interface every later agent builds against.
// ---------------------------------------------------------------------------

export interface SavePredictionInput {
  matchId: string;
  pick: Outcome;
}

export interface SavePredictionsResult {
  saved: number;
  /** Match ids rejected because the match was already locked (now >= kickoff). */
  rejectedLocked: string[];
}

export interface CreateUserResult {
  user: User;
  /** The plaintext access code — shown to the user ONCE, never stored raw. */
  code: string;
}

/** A point-in-time view of the ingestion heartbeat. */
export interface SyncStatus {
  /** ISO-8601 of the last sync pass, or null if never run this process. */
  lastSyncAt: string | null;
  /** Human-readable note from the last sync (for logs / organizer UI). */
  lastSyncNote: string | null;
  /** Count of matches currently recorded from the 'feed' source. */
  feedResultCount: number;
}

export interface DataStore {
  // -- reads --
  getDepartments(): Promise<Department[]>;
  getMatches(): Promise<Match[]>;
  /** The matches for the "next open matchday" the user should pick, in order. */
  getMatchday(): Promise<Match[]>;
  /**
   * ALL matches that can be predicted RIGHT NOW: kickoff is still in the future
   * (now < kickoff, i.e. not locked) AND both teams are known real teams (not KO
   * bracket placeholders). Sorted by kickoff ascending. Group-stage matches all
   * qualify immediately; a KO match only appears once its placeholders have been
   * resolved to real teams (see setMatchTeams). Powers the batch-prediction board.
   */
  getPredictableMatches(): Promise<Match[]>;
  getUser(id: string): Promise<User | null>;
  getUserByToken(tokenHash: string): Promise<User | null>;
  /** Total number of registered players (drives the live count badge). */
  getUserCount(): Promise<number>;
  getPredictionsForUser(userId: string): Promise<Prediction[]>;
  getResults(): Promise<Result[]>;
  getLeaderboard(): Promise<LeaderboardRow[]>;
  getDepartmentStandings(): Promise<DepartmentStanding[]>;
  getConsensus(matchId: string): Promise<Consensus>;
  /** Ingestion heartbeat: last sync time + note + feed-result count. */
  getSyncStatus(): Promise<SyncStatus>;

  // -- writes --
  /**
   * Create a participant in `department`, which may be EITHER an existing
   * department id / name OR a brand-new name. A new name creates the department
   * on the fly (departments are dynamic — joiners can add their own lane).
   */
  createUser(displayName: string, department: string): Promise<CreateUserResult>;
  /**
   * GDPR right-to-erasure: HARD-DELETE a user and everything tied to them —
   * their predictions and any persisted leaderboard row — so they fully
   * disappear from the board and the consensus. Idempotent (an unknown id is a
   * no-op). The leaderboards/consensus recompute from raw rows on the next read,
   * so removing the predictions is enough for them to vanish.
   */
  deleteUser(userId: string): Promise<void>;
  /** Set a user's voluntary jersey-pool opt-in flag. */
  setJerseyOptIn(userId: string, optIn: boolean): Promise<void>;
  /** Everyone currently opted into the jersey pool (for the organizer's list). */
  getJerseyOptIns(): Promise<JerseyParticipant[]>;
  /** Create a department from a free-form name (idempotent on slug). */
  createDepartment(name: string): Promise<Department>;
  /**
   * Resolve a department by id or name, creating it from the name if missing.
   * The seam joiners use to add a new lane without a separate admin step.
   */
  getOrCreateDepartmentByName(idOrName: string): Promise<Department>;
  /**
   * True if a user with this display name (case-insensitive, trimmed) already
   * exists in the given department. Used to reject a duplicate name+department
   * signup so the board never shows two identical entries.
   */
  nameTakenInDepartment(
    displayName: string,
    departmentId: string,
  ): Promise<boolean>;
  /**
   * Save a user's picks. MUST reject any pick whose match has reached kickoff
   * (server-side lock). Upserts on (userId, matchId).
   */
  savePredictions(
    userId: string,
    picks: SavePredictionInput[],
  ): Promise<SavePredictionsResult>;
  /**
   * Organizer confirmation / OVERRIDE — stamps source 'organizer', which always
   * wins over the feed. This is NO LONGER a required step: results arrive
   * automatically from the feed (recordFeedResult). It exists only to correct a
   * wrong or missing feed value.
   */
  setResult(matchId: string, outcome: Outcome): Promise<Result>;
  /**
   * Record an AUTHORITATIVE feed result (source 'feed'). The default source of
   * truth now. Idempotent and respectful of overrides: it will NOT clobber an
   * existing organizer result. Returns the winning Result for the match.
   */
  recordFeedResult(matchId: string, outcome: Outcome): Promise<Result>;
  /** Update the ingestion heartbeat after a sync pass. */
  markSync(note?: string): Promise<void>;
  /**
   * Overwrite a match's team labels — used to resolve a KO fixture's bracket
   * PLACEHOLDERS ("W101","1A") to the real qualified teams once the feed knows
   * them (lib/ingest/sync.ts). Idempotent at the call site (callers skip
   * already-resolved matches). Returns the updated Match. Throws on unknown id.
   */
  setMatchTeams(matchId: string, home: string, away: string): Promise<Match>;

  // -- seeding / maintenance --
  /** Idempotently seed fixtures/bracket/kickoffs (in prod: from openfootball). */
  seedFromOpenfootball(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mock seed data lives in lib/seed.ts (shared with the Drizzle store). The
// MockStore demo snapshot below uses these plus a small ISO helper.
// ---------------------------------------------------------------------------

function iso(d: string): string {
  return new Date(d).toISOString();
}

// ---------------------------------------------------------------------------
// In-memory mock store.
// ---------------------------------------------------------------------------

let mockIdCounter = 0;
function nextId(prefix: string): string {
  mockIdCounter += 1;
  return `${prefix}-${mockIdCounter.toString(36)}`;
}

export interface MockStoreOptions {
  /**
   * Seed the believable mid-tournament demo snapshot (12 demo colleagues,
   * faked-past kickoffs, recorded results, frozen "previous" ranks).
   *
   * DEFAULT IS THE REAL EMPTY SCHEDULE (false). The demo is OPT-IN via
   * SEED_DEMO=1 so the production default at the real 2026-06-02 clock shows the
   * true upcoming fixtures with NOTHING locked and an empty scoreboard. The
   * Playwright suite sets SEED_DEMO=1 to validate the populated UI; the contract
   * tests pass false explicitly for a clean store that matches a fresh
   * DrizzleStore byte-for-byte.
   *
   * When omitted, falls back to `process.env.SEED_DEMO === "1"`.
   */
  seedDemo?: boolean;
}

/** True when the demo snapshot is requested via the env flag. */
function seedDemoFromEnv(): boolean {
  return process.env.SEED_DEMO === "1";
}

export class MockStore implements DataStore {
  private departments: Department[] = [];
  private matches: Match[] = [];
  private users: User[] = [];
  private predictions: Prediction[] = [];
  private results: Result[] = [];
  private lastSyncAt: string | null = null;
  private lastSyncNote: string | null = null;
  /** Frozen "previous" department ranks so climb-delta is non-zero in the demo. */
  private previousDeptRanks: Record<string, number> = {};
  private previousUserRanks: Record<string, number> = {};
  private seeded = false;

  constructor(options: MockStoreOptions = {}) {
    void this.seedFromOpenfootball();
    if (options.seedDemo ?? seedDemoFromEnv()) void this.seedDemoSnapshot();
  }

  // -- clock seam: a single place that decides "now" so tests can reason --
  protected now(): Date {
    return new Date();
  }

  private isLocked(match: Match): boolean {
    return this.now().getTime() >= new Date(match.kickoff).getTime();
  }

  async seedFromOpenfootball(): Promise<void> {
    if (this.seeded) return;
    this.departments = DEPARTMENTS.map((d) => ({ ...d }));
    this.matches = SEED_MATCHES.map((m) => ({ ...m }));
    this.seeded = true;
  }

  /**
   * Seed a believable MID-TOURNAMENT snapshot so the demo isn't an empty 0-0
   * board: finished matches WITH feed results, picks across all five seed
   * departments PLUS one user-created department ("Energy Growth"), and a frozen
   * "previous" standings snapshot so climb-delta is non-zero and the scoreboard
   * shows a real overtake.
   *
   * HONEST NOTE: real "today" is 2026-06-02, BEFORE the 11 Jun kickoff, so the
   * tournament hasn't actually started. To make the DEMO non-empty the mock
   * FAKES three real group kickoffs into the past (relative to the wall clock)
   * and records their results as source 'feed'. This is DEMO-ONLY sugar, gated
   * behind SEED_DEMO=1; the default app, the Neon store, and the real schedule
   * all keep the true future kickoffs (nothing locked at 2026-06-02).
   */
  private async seedDemoSnapshot(): Promise<void> {
    if (this.users.length > 0) return;

    // The three earliest REAL group fixtures, faked into the past so they read
    // as final. Ids are content-derived from the bundled openfootball file.
    const G1 = "of-matchday-1-mexico-south-africa";
    const G2 = "of-matchday-1-south-korea-czech-republic";
    const G3 = "of-matchday-2-canada-bosnia-herzegovina";

    // -- fake three kickoffs into the past so they read as final --
    const pastKickoff = (hoursAgo: number) =>
      new Date(this.now().getTime() - hoursAgo * 3_600_000).toISOString();
    const setKickoff = (id: string, isoTs: string) => {
      const m = this.matches.find((x) => x.id === id);
      if (m) m.kickoff = isoTs;
    };
    setKickoff(G1, pastKickoff(72)); // Mexico v South Africa — 3 days ago
    setKickoff(G2, pastKickoff(48)); // South Korea v Czech Republic — 2 days ago
    setKickoff(G3, pastKickoff(24)); // Canada v Bosnia & Herzegovina — yesterday

    // -- a user-created department (the "add your own lane" path) --
    const energyGrowth: Department = {
      id: "dept-energy-growth",
      name: "Energy Growth",
      slug: "energy-growth",
      color: DYNAMIC_DEPARTMENT_COLORS[0]!,
    };
    this.departments.push(energyGrowth);

    const make = (
      name: string,
      deptId: string,
      isOrganizer = false,
    ): User => ({
      id: nextId("user"),
      displayName: name,
      departmentId: deptId,
      tokenHash: `mock-hash-${name.toLowerCase().replace(/\s+/g, "-")}`,
      isOrganizer,
      joinedAt: iso("2026-06-02T09:00:00Z"),
      jerseyOptIn: false,
    });

    // "you" is the demo lead, Max Stegemann (Energy CS). Sofia is the organizer.
    const you = make("Max Stegemann", "dept-energy-cs");
    you.tokenHash = "mock-hash-you"; // stable handle the UI can sign in as
    const sofia = make("Sophie Krüger", "dept-energy-ops", true);
    const priya = make("Lukas Hoffmann", "dept-energy-cs");
    const jonas = make("Jonas Becker", "dept-energy-tech");
    const lena = make("Lena Schäfer", "dept-energy-tech");
    const tariq = make("Tobias Wagner", "dept-energy-tech"); // 3rd member -> Tech is eligible
    const marco = make("Marco Schmidt", "dept-energy-ops");
    const ines = make("Ines Albrecht", "dept-energy-ops"); // 3rd member -> Ops is eligible
    const fatima = make("Felix Brandt", "dept-energy-invoicing");
    const bjorn = make("Björn Neumann", "dept-energy-finance");
    // The user-created department, two members (intentionally < 3 -> ineligible).
    const noor = make("Nina Vogel", "dept-energy-growth");
    const sam = make("Sebastian Lang", "dept-energy-growth");

    this.users = [
      you, sofia, priya, jonas, lena, tariq, marco, ines, fatima, bjorn, noor, sam,
    ];

    const p = (u: User, matchId: string, pick: Outcome) => {
      this.predictions.push({
        id: nextId("pred"),
        userId: u.id,
        matchId,
        pick,
        createdAt: iso("2026-05-30T10:00:00Z"),
        updatedAt: iso("2026-05-30T10:00:00Z"),
      });
    };

    // Finished results (source 'feed' — the authoritative path):
    //   G1 Mexico v South Africa        -> home   [group, 1pt]
    //   G2 South Korea v Czech Republic -> away   [group, 1pt]
    //   G3 Canada v Bosnia & Herzegovina-> home   [group, 1pt]
    const feed = (matchId: string, outcome: Outcome) => {
      this.results.push({
        matchId,
        outcome,
        source: "feed",
        updatedAt: pastKickoff(20),
      });
    };
    feed(G1, "home");
    feed(G2, "away");
    feed(G3, "home");

    // Picks. Designed so Energy Tech overtakes Energy Ops on the latest scoring
    // (the previous snapshot below had Ops ahead) and small teams can't top it.
    // you (CS):  G1 home ✓(+1), G2 away ✓(+1), G3 home ✓(+1)  => 3
    p(you, G1, "home");
    p(you, G2, "away");
    p(you, G3, "home");
    // priya (CS): G1 home ✓(+1), G3 away ✗            => 1   (CS avg = 2 over 2)
    p(priya, G1, "home");
    p(priya, G3, "away");
    // Energy Tech (jonas, lena, tariq) — strong week, the overtaker.
    p(jonas, G1, "home"); // +1
    p(jonas, G2, "away"); // +1
    p(jonas, G3, "home"); // +1  => 3
    p(lena, G1, "home"); // +1
    p(lena, G3, "home"); // +1  => 2
    p(tariq, G2, "away"); // +1
    p(tariq, G3, "home"); // +1  => 2  (Tech avg = 7/3 ≈ 2.33)
    // Energy Ops (sofia, marco, ines) — led last week, slips behind.
    p(sofia, G1, "home"); // +1
    p(sofia, G2, "home"); // ✗
    p(marco, G1, "away"); // ✗
    p(marco, G3, "home"); // +1
    p(ines, G2, "away"); // +1  (Ops avg = 3/3 = 1.0)
    // Energy Invoicing (fatima) — only 1 active member -> ineligible.
    p(fatima, G1, "home"); // +1  (Invoicing avg = 1, but < 3 members)
    // Energy Finance (bjorn) — only 1 active member -> ineligible.
    p(bjorn, G3, "home"); // +1
    // Energy Growth (noor, sam) — user-created, 2 members -> ineligible.
    p(noor, G1, "home"); // +1
    p(sam, G3, "home"); // +1  (Growth avg = 1, but < 3 members)

    // A frozen "previous" snapshot where Energy Ops led Energy Tech. The new
    // recompute above flips them, so the board shows a genuine overtake and a
    // non-zero climb-delta for both.
    this.previousDeptRanks = {
      "dept-energy-ops": 1, // was top last week
      "dept-energy-tech": 2, // was second -> now climbs to 1
      "dept-energy-cs": 3,
      "dept-energy-invoicing": 4,
      "dept-energy-finance": 5,
      "dept-energy-growth": 6,
    };
    this.previousUserRanks = {
      [jonas.id]: 4, // climbs
      [you.id]: 1,
      [lena.id]: 5,
      [tariq.id]: 6,
    };

    this.lastSyncAt = pastKickoff(18);
    this.lastSyncNote =
      "Auto-synced 3 finished matches from the results feed. Organizer can override any call.";
  }

  async getDepartments(): Promise<Department[]> {
    return this.departments.map((d) => ({ ...d }));
  }

  private syncStatuses(): void {
    // Reflect the wall clock into match.status for reads. Result presence wins.
    const resolved = new Set(this.results.map((r) => r.matchId));
    for (const m of this.matches) {
      if (resolved.has(m.id)) m.status = "final";
      else if (this.isLocked(m)) m.status = "locked";
      else m.status = "scheduled";
    }
  }

  async getMatches(): Promise<Match[]> {
    this.syncStatuses();
    return [...this.matches]
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .map((m) => ({ ...m }));
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
    // Every match still open (now < kickoff) whose teams are both real — i.e. not
    // locked and not an unresolved KO placeholder. getMatches() already sorts by
    // kickoff and stamps status against the live clock.
    const all = await this.getMatches();
    return all.filter((m) => m.status === "scheduled" && hasKnownTeams(m));
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async getUserByToken(tokenHash: string): Promise<User | null> {
    return this.users.find((u) => u.tokenHash === tokenHash) ?? null;
  }

  async getUserCount(): Promise<number> {
    return this.users.length;
  }

  async getPredictionsForUser(userId: string): Promise<Prediction[]> {
    return this.predictions
      .filter((p) => p.userId === userId)
      .map((p) => ({ ...p }));
  }

  async getResults(): Promise<Result[]> {
    return this.results.map((r) => ({ ...r }));
  }

  async createDepartment(name: string): Promise<Department> {
    const slug = slugify(name);
    // Idempotent on slug: an existing department with the same slug wins.
    const existing = this.departments.find((d) => d.slug === slug);
    if (existing) return { ...existing };
    const color =
      DYNAMIC_DEPARTMENT_COLORS[
        this.departments.length % DYNAMIC_DEPARTMENT_COLORS.length
      ]!;
    const dept: Department = {
      id: `dept-${slug}`,
      name: name.trim(),
      slug,
      color,
    };
    this.departments.push(dept);
    return { ...dept };
  }

  async getOrCreateDepartmentByName(idOrName: string): Promise<Department> {
    const trimmed = idOrName.trim();
    const slug = slugify(trimmed);
    const found = this.departments.find(
      (d) =>
        d.id === trimmed ||
        d.slug === slug ||
        d.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (found) return { ...found };
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
    return this.users.some(
      (u) =>
        u.departmentId === departmentId &&
        u.displayName.trim().toLowerCase() === norm,
    );
  }

  async createUser(
    displayName: string,
    department: string,
  ): Promise<CreateUserResult> {
    // `department` may be an existing id/name OR a brand-new name — resolve it,
    // creating the department on the fly when it's new (dynamic departments).
    const dept = await this.getOrCreateDepartmentByName(department);
    // Lazy import keeps auth (server-only) out of any client bundle that might
    // touch the store's types.
    const { generateCode, hashToken } = await import("./auth");
    const code = generateCode();
    const tokenHash = await hashToken(code);
    const user: User = {
      id: nextId("user"),
      displayName,
      departmentId: dept.id,
      tokenHash,
      isOrganizer: false,
      jerseyOptIn: false,
      joinedAt: this.now().toISOString(),
    };
    this.users.push(user);
    return { user, code };
  }

  async deleteUser(userId: string): Promise<void> {
    // GDPR erasure: drop the user, their predictions, and their frozen rank
    // snapshot. Leaderboards + consensus are derived from (users, predictions)
    // on read, so once these rows are gone the user vanishes everywhere.
    this.users = this.users.filter((u) => u.id !== userId);
    this.predictions = this.predictions.filter((p) => p.userId !== userId);
    delete this.previousUserRanks[userId];
  }

  async setJerseyOptIn(userId: string, optIn: boolean): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) u.jerseyOptIn = optIn;
  }

  async getJerseyOptIns(): Promise<JerseyParticipant[]> {
    const deptName = new Map(this.departments.map((d) => [d.id, d.name]));
    return this.users
      .filter((u) => u.jerseyOptIn)
      .map((u) => ({
        displayName: u.displayName,
        departmentName: deptName.get(u.departmentId) ?? u.departmentId,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async savePredictions(
    userId: string,
    picks: SavePredictionInput[],
  ): Promise<SavePredictionsResult> {
    // SERVER-SIDE LOCK: reject any pick whose match has reached kickoff.
    // This is the authoritative gate — it does not trust the caller/UI.
    const rejectedLocked: string[] = [];
    let saved = 0;
    const nowIso = this.now().toISOString();

    for (const pick of picks) {
      const match = this.matches.find((m) => m.id === pick.matchId);
      if (!match) {
        rejectedLocked.push(pick.matchId); // unknown match: treat as rejected
        continue;
      }
      if (this.isLocked(match)) {
        rejectedLocked.push(pick.matchId);
        continue;
      }
      // SEMANTIC GATE (server-side truth, does not trust the UI):
      //   - a 'draw' is only valid in the GROUP stage; knockouts always resolve.
      //   - a match with an unresolved/placeholder team is NOT predictable yet.
      // Either makes the pick invalid -> rejected via the same channel, never saved.
      if (pick.pick === "draw" && match.stage !== "group") {
        rejectedLocked.push(pick.matchId);
        continue;
      }
      if (!hasKnownTeams(match)) {
        rejectedLocked.push(pick.matchId);
        continue;
      }
      // Upsert on (userId, matchId) — enforces UNIQUE(userId, matchId).
      const existing = this.predictions.find(
        (p) => p.userId === userId && p.matchId === pick.matchId,
      );
      if (existing) {
        existing.pick = pick.pick;
        existing.updatedAt = nowIso;
      } else {
        this.predictions.push({
          id: nextId("pred"),
          userId,
          matchId: pick.matchId,
          pick: pick.pick,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
      saved += 1;
    }
    return { saved, rejectedLocked };
  }

  async setResult(matchId: string, outcome: Outcome): Promise<Result> {
    // Organizer OVERRIDE. Always stamps source 'organizer', which wins over the
    // feed (see resolveResult). No longer required — only used to correct a
    // wrong/missing feed value.
    const match = this.matches.find((m) => m.id === matchId);
    if (!match) throw new Error(`Unknown match: ${matchId}`);
    const existing = this.results.find((r) => r.matchId === matchId);
    const updatedAt = this.now().toISOString();
    if (existing) {
      existing.outcome = outcome;
      existing.source = "organizer";
      existing.updatedAt = updatedAt;
      this.syncStatuses();
      return { ...existing };
    }
    const result: Result = { matchId, outcome, source: "organizer", updatedAt };
    this.results.push(result);
    this.syncStatuses();
    return { ...result };
  }

  async recordFeedResult(matchId: string, outcome: Outcome): Promise<Result> {
    // AUTHORITATIVE feed ingest. Idempotent and override-safe: an existing
    // organizer result wins and is left untouched. A prior feed result is
    // refreshed in place. resolveResult encodes the precedence rule.
    const match = this.matches.find((m) => m.id === matchId);
    if (!match) throw new Error(`Unknown match: ${matchId}`);
    const existing = this.results.find((r) => r.matchId === matchId);
    const incoming: Result = {
      matchId,
      outcome,
      source: "feed",
      updatedAt: this.now().toISOString(),
    };
    const winner = resolveResult(incoming, existing);
    if (existing) {
      // Keep the organizer override; otherwise adopt the fresh feed value.
      existing.outcome = winner!.outcome;
      existing.source = winner!.source;
      existing.updatedAt = winner!.updatedAt;
      this.syncStatuses();
      return { ...existing };
    }
    this.results.push(incoming);
    this.syncStatuses();
    return { ...incoming };
  }

  private matchStages(): Record<string, Stage> {
    const map: Record<string, Stage> = {};
    for (const m of this.matches) map[m.id] = m.stage;
    return map;
  }

  /**
   * Recompute both leaderboards against the LAST-seen ranks. Climb-delta is
   * live across reads, matching the DrizzleStore (which persists derived tables
   * every recompute). The seeded demo snapshot pre-loads the "previous" ranks,
   * so the FIRST render shows the staged overtake; later reads track real
   * movement. Each read-method records ONLY its own dimension's fresh ranks
   * (user vs department), so the two demo reads on one page render don't
   * stomp each other's seeded snapshot.
   */
  private recompute(): RecomputeOutput {
    return recomputeLeaderboards({
      users: this.users,
      predictions: this.predictions,
      results: this.results,
      matchStages: this.matchStages(),
      departments: this.departments,
      previous: {
        users: this.previousUserRanks,
        departments: this.previousDeptRanks,
      },
    });
  }

  async getLeaderboard(): Promise<LeaderboardRow[]> {
    const { leaderboard } = this.recompute();
    // Snapshot the freshly computed USER ranks as the next "previous".
    this.previousUserRanks = Object.fromEntries(
      leaderboard.map((r) => [r.userId, r.rank]),
    );
    return leaderboard;
  }

  async getDepartmentStandings(): Promise<DepartmentStanding[]> {
    const { departments } = this.recompute();
    // Snapshot the freshly computed DEPARTMENT ranks as the next "previous".
    this.previousDeptRanks = Object.fromEntries(
      departments.map((d) => [d.departmentId, d.rank]),
    );
    return departments;
  }

  async getConsensus(matchId: string): Promise<Consensus> {
    return computeConsensus(matchId, this.predictions);
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return {
      lastSyncAt: this.lastSyncAt,
      lastSyncNote: this.lastSyncNote,
      feedResultCount: this.results.filter((r) => r.source === "feed").length,
    };
  }

  async markSync(note?: string): Promise<void> {
    this.lastSyncAt = this.now().toISOString();
    this.lastSyncNote = note ?? null;
  }

  async setMatchTeams(
    matchId: string,
    home: string,
    away: string,
  ): Promise<Match> {
    const match = this.matches.find((m) => m.id === matchId);
    if (!match) throw new Error(`Unknown match: ${matchId}`);
    match.home = home;
    match.away = away;
    return { ...match };
  }
}

// ---------------------------------------------------------------------------
// Neon + Drizzle store.
//
// Real persistence, used when DATABASE_URL is set. The query logic lives in the
// driver-agnostic DrizzleStore (db/drizzleStore.ts); this thin wrapper just
// lazily builds the Neon-http Drizzle handle (db/client.ts, server-only) and
// delegates. The SAME DrizzleStore class runs on PGlite in the contract tests,
// so prod and tests exercise identical code.
//
// We construct the handle lazily (first call) so importing this module in a
// mock-only flow never opens a Neon connection.
// ---------------------------------------------------------------------------

class NeonStore implements DataStore {
  private inner: Promise<DataStore> | null = null;

  constructor(private readonly databaseUrl: string) {}

  /** Build (once) the DrizzleStore over the Neon handle and seed fixtures. */
  private async resolve(): Promise<DataStore> {
    if (!this.inner) {
      this.inner = (async () => {
        const [{ getDb }, { DrizzleStore }] = await Promise.all([
          import("@/db/client"),
          import("@/db/drizzleStore"),
        ]);
        const store = new DrizzleStore(getDb());
        // Idempotent: seeds departments + fixtures only when empty.
        await store.seedFromOpenfootball();
        return store as DataStore;
      })();
    }
    return this.inner;
  }

  async getDepartments(): Promise<Department[]> {
    return (await this.resolve()).getDepartments();
  }
  async getMatches(): Promise<Match[]> {
    return (await this.resolve()).getMatches();
  }
  async getMatchday(): Promise<Match[]> {
    return (await this.resolve()).getMatchday();
  }
  async getPredictableMatches(): Promise<Match[]> {
    return (await this.resolve()).getPredictableMatches();
  }
  async getUser(id: string): Promise<User | null> {
    return (await this.resolve()).getUser(id);
  }
  async getUserByToken(tokenHash: string): Promise<User | null> {
    return (await this.resolve()).getUserByToken(tokenHash);
  }

  async getUserCount(): Promise<number> {
    return (await this.resolve()).getUserCount();
  }
  async getPredictionsForUser(userId: string): Promise<Prediction[]> {
    return (await this.resolve()).getPredictionsForUser(userId);
  }
  async getResults(): Promise<Result[]> {
    return (await this.resolve()).getResults();
  }
  async getLeaderboard(): Promise<LeaderboardRow[]> {
    return (await this.resolve()).getLeaderboard();
  }
  async getDepartmentStandings(): Promise<DepartmentStanding[]> {
    return (await this.resolve()).getDepartmentStandings();
  }
  async getConsensus(matchId: string): Promise<Consensus> {
    return (await this.resolve()).getConsensus(matchId);
  }
  async getSyncStatus(): Promise<SyncStatus> {
    return (await this.resolve()).getSyncStatus();
  }
  async createUser(
    displayName: string,
    department: string,
  ): Promise<CreateUserResult> {
    return (await this.resolve()).createUser(displayName, department);
  }
  async deleteUser(userId: string): Promise<void> {
    return (await this.resolve()).deleteUser(userId);
  }
  async setJerseyOptIn(userId: string, optIn: boolean): Promise<void> {
    return (await this.resolve()).setJerseyOptIn(userId, optIn);
  }
  async getJerseyOptIns(): Promise<JerseyParticipant[]> {
    return (await this.resolve()).getJerseyOptIns();
  }
  async createDepartment(name: string): Promise<Department> {
    return (await this.resolve()).createDepartment(name);
  }
  async getOrCreateDepartmentByName(idOrName: string): Promise<Department> {
    return (await this.resolve()).getOrCreateDepartmentByName(idOrName);
  }
  async nameTakenInDepartment(
    displayName: string,
    departmentId: string,
  ): Promise<boolean> {
    return (await this.resolve()).nameTakenInDepartment(
      displayName,
      departmentId,
    );
  }
  async savePredictions(
    userId: string,
    picks: SavePredictionInput[],
  ): Promise<SavePredictionsResult> {
    return (await this.resolve()).savePredictions(userId, picks);
  }
  async setResult(matchId: string, outcome: Outcome): Promise<Result> {
    return (await this.resolve()).setResult(matchId, outcome);
  }
  async recordFeedResult(matchId: string, outcome: Outcome): Promise<Result> {
    return (await this.resolve()).recordFeedResult(matchId, outcome);
  }
  async markSync(note?: string): Promise<void> {
    return (await this.resolve()).markSync(note);
  }
  async setMatchTeams(
    matchId: string,
    home: string,
    away: string,
  ): Promise<Match> {
    return (await this.resolve()).setMatchTeams(matchId, home, away);
  }
  async seedFromOpenfootball(): Promise<void> {
    return (await this.resolve()).seedFromOpenfootball();
  }
}

// ---------------------------------------------------------------------------
// Store selection. Memoized per-process.
//
// The singleton is pinned on `globalThis`, not a module-level `let`. Next.js
// bundles Server Actions, Route Handlers, and RSC page renders into SEPARATE
// module instances (and hot-reloads them in dev), so a plain module-scoped
// variable would give each layer its OWN MockStore: a user created in an
// action would be invisible to the page that renders next. Anchoring on
// globalThis makes the in-memory store genuinely process-global and shared
// across every layer — the same guard lib/ingest/feedStore.ts already uses.
// (With DATABASE_URL set, NeonStore is stateless wiring, so this is harmless.)
// ---------------------------------------------------------------------------

const STORE_KEY = "__wm2026_data_store__";

/**
 * Return the active data store. Uses Neon when DATABASE_URL is set, otherwise
 * the zero-setup in-memory mock. Call this everywhere; never instantiate a
 * store directly.
 */
export function getStore(): DataStore {
  const g = globalThis as unknown as Record<string, DataStore | undefined>;
  const existing = g[STORE_KEY];
  if (existing) return existing;
  const url = process.env.DATABASE_URL;
  const store = url ? new NeonStore(url) : new MockStore();
  g[STORE_KEY] = store;
  return store;
}

/** True when the app is running on the mock store (useful for UI banners). */
export function isMockStore(): boolean {
  return !process.env.DATABASE_URL;
}
