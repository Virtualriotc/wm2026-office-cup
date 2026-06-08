// ============================================================================
// Shared domain contracts for the WM 2026 Office Cup.
// These types are the stable boundary every other layer builds against:
// the data store (mock + Drizzle), scoring, auth, and the UI. Keep them in
// sync with db/schema.ts. Changing a shape here is a cross-cutting change.
// ============================================================================

/** Tournament stage. Drives the points weight (see lib/scoring.ts). */
export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "final";

/** A match outcome / a user's pick. Knockouts never resolve to "draw". */
export type Outcome = "home" | "draw" | "away";

/** Where a confirmed result came from. Organizer always wins over the feed. */
export type ResultSource = "organizer" | "feed";

/**
 * Lifecycle of a match.
 * - `scheduled`: before kickoff, picks are open.
 * - `locked`: kickoff reached, picks frozen and made public; awaiting result.
 * - `final`: result confirmed, counts toward scoring.
 */
export type MatchStatus = "scheduled" | "locked" | "final";

/** The fixed department list (the race's lanes). "Other" is the catch-all. */
export interface Department {
  id: string;
  /** Display name, e.g. "Sales". */
  name: string;
  /** Stable slug used in URLs / seeds, e.g. "sales". */
  slug: string;
  /** Hex color for the race lane / badge, e.g. "#36A85B". */
  color: string;
}

/**
 * A participant. There is no password: identity is a private CODE whose hash
 * is stored as `tokenHash`. `isOrganizer` gates the results-confirmation UI.
 */
export interface User {
  id: string;
  displayName: string;
  departmentId: string;
  /** SHA-256 hash of the user's access code. The plaintext code is shown ONCE. */
  tokenHash: string;
  isOrganizer: boolean;
  /** Opted into the (voluntary) jersey prize pool. Default false. */
  jerseyOptIn: boolean;
  joinedAt: string; // ISO-8601
}

/** A jersey-pool participant, for the organizer's "who's in" list. */
export interface JerseyParticipant {
  displayName: string;
  departmentName: string;
}

/** A fixture. Locks at `kickoff`, enforced server-side. */
export interface Match {
  id: string;
  stage: Stage;
  /** Group letter for group-stage matches (e.g. "C"); null for knockouts. */
  group: string | null;
  /** Home team / first-named side. */
  home: string;
  /** Away team / second-named side. */
  away: string;
  /** ISO-8601 kickoff. The match locks the instant `now >= kickoff`. */
  kickoff: string;
  status: MatchStatus;
  /** External feed id (e.g. API-Football fixture id) for pre-fill mapping. */
  externalRef: string | null;
}

/** A single user's call on a single match. UNIQUE(userId, matchId). */
export interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  pick: Outcome;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/** The confirmed outcome of a match. One row per resolved match. */
export interface Result {
  matchId: string;
  outcome: Outcome;
  source: ResultSource;
  updatedAt: string; // ISO-8601
}

/**
 * One row in the relative leaderboard. We never render absolute "#N of M";
 * the UI uses rank + percentile + climbDelta to frame position relatively.
 */
export interface LeaderboardRow {
  userId: string;
  displayName: string;
  departmentId: string;
  points: number;
  rank: number;
  /** 0–100; lower is better (top 10% => 10). */
  percentile: number;
  /** Rank change since the previous recompute (+ = climbed, - = dropped). */
  climbDelta: number;
}

/** A department's standing in the race. Score = avg points per active member. */
export interface DepartmentStanding {
  departmentId: string;
  name: string;
  color: string;
  /** Average points across members with >= 1 pick. */
  avgPoints: number;
  /** Count of members with >= 1 pick. */
  activeMembers: number;
  rank: number;
  /** Rank change since the previous recompute. */
  climbDelta: number;
  /** False when activeMembers < the min-participants guard. */
  eligible: boolean;
}

/** Office consensus for one match: what colleagues picked. No external odds. */
export interface Consensus {
  matchId: string;
  /** Percentages 0–100; pctHome + pctDraw + pctAway ~= 100 when n > 0. */
  pctHome: number;
  pctDraw: number;
  pctAway: number;
  /** Total predictions counted. */
  n: number;
}
