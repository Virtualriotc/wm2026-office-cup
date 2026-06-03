// ============================================================================
// Scoring — PURE functions, no I/O, no clock, no randomness.
// This is the rules engine. Everything here must be deterministic so the
// recompute is idempotent: re-running over the same (users, preds, results)
// always yields identical leaderboards. The data store calls these inside a
// single transaction (full DELETE+INSERT of derived tables).
// ============================================================================

import type {
  Stage,
  Outcome,
  User,
  Prediction,
  Result,
  LeaderboardRow,
  DepartmentStanding,
  Consensus,
  Department,
} from "./types";

/**
 * Points awarded for a correct pick, by stage. Knockouts are weighted higher
 * so latecomers and the back half of the table stay alive (the retention
 * lever from goal.md §1). A wrong or missing pick is always 0.
 */
export const STAGE_POINTS: Record<Stage, number> = {
  group: 1,
  r32: 2,
  r16: 3,
  qf: 4,
  sf: 5,
  final: 6,
};

/**
 * Minimum active members (>= 1 pick) for a department to be RANK-ELIGIBLE for
 * the standings / top spot. A department below this still appears on the race
 * but is flagged `eligible: false` and sorted to the bottom, so a one- or
 * two-person team can't sit at the top on a fluke average (goal.md §1).
 */
export const MIN_ACTIVE_MEMBERS = 3;

/** @deprecated kept as an alias for older imports; use MIN_ACTIVE_MEMBERS. */
export const MIN_DEPARTMENT_PARTICIPANTS = MIN_ACTIVE_MEMBERS;

/**
 * Resolve which Result wins for a match when both a feed-ingested value and an
 * organizer value exist. The organizer override ALWAYS wins when present; the
 * feed is authoritative only in its absence. Pure: no I/O, no clock.
 *
 * @returns the winning Result, or null when neither source has one.
 */
export function resolveResult(
  feed: Result | undefined | null,
  organizer: Result | undefined | null,
): Result | null {
  if (organizer && organizer.source === "organizer") return organizer;
  return feed ?? organizer ?? null;
}

/**
 * Score a single prediction against a result.
 * @returns the points earned (0 if wrong, missing result, or no pick).
 */
export function scoreMatch(
  pred: Prediction | undefined | null,
  result: Result | undefined | null,
  stage: Stage,
): number {
  if (!pred || !result) return 0; // missed pick or unresolved match => 0
  return pred.pick === result.outcome ? STAGE_POINTS[stage] : 0;
}

/** Previous ranks keyed by id, so we can compute a climb-delta. */
export interface PreviousRanks {
  /** userId -> rank from the last recompute. */
  users?: Record<string, number>;
  /** departmentId -> rank from the last recompute. */
  departments?: Record<string, number>;
}

export interface RecomputeInput {
  users: User[];
  predictions: Prediction[];
  results: Result[];
  /** Needed to know each match's stage (and thus its point value). */
  matchStages: Record<string, Stage>;
  departments: Department[];
  /** Optional prior ranks to derive climbDelta. */
  previous?: PreviousRanks;
}

export interface RecomputeOutput {
  leaderboard: LeaderboardRow[];
  departments: DepartmentStanding[];
}

/**
 * Full, idempotent recompute of both leaderboards from raw predictions +
 * results. Deterministic ordering: points desc, then displayName asc, then
 * userId asc — so ties never wobble between runs.
 */
export function recomputeLeaderboards(input: RecomputeInput): RecomputeOutput {
  const { users, predictions, results, matchStages, departments, previous } =
    input;

  const resultByMatch = new Map<string, Result>();
  for (const r of results) resultByMatch.set(r.matchId, r);

  // Group predictions by user for scoring, and track who is "active".
  const predsByUser = new Map<string, Prediction[]>();
  for (const p of predictions) {
    const list = predsByUser.get(p.userId);
    if (list) list.push(p);
    else predsByUser.set(p.userId, [p]);
  }

  // ---- Per-user points ----
  const pointsByUser = new Map<string, number>();
  for (const u of users) {
    let total = 0;
    const userPreds = predsByUser.get(u.id) ?? [];
    for (const p of userPreds) {
      const stage = matchStages[p.matchId];
      if (!stage) continue; // unknown match => ignore
      total += scoreMatch(p, resultByMatch.get(p.matchId), stage);
    }
    pointsByUser.set(u.id, total);
  }

  // ---- User leaderboard (rank + percentile + climbDelta) ----
  const sortedUsers = [...users].sort((a, b) => {
    const pa = pointsByUser.get(a.id) ?? 0;
    const pb = pointsByUser.get(b.id) ?? 0;
    if (pb !== pa) return pb - pa;
    if (a.displayName !== b.displayName)
      return a.displayName.localeCompare(b.displayName);
    return a.id.localeCompare(b.id);
  });

  const total = sortedUsers.length;
  const leaderboard: LeaderboardRow[] = sortedUsers.map((u, i) => {
    const rank = i + 1;
    const prevRank = previous?.users?.[u.id];
    // percentile: top => low number. rank 1 of 100 => 1; rank 100 => 100.
    const percentile = total > 0 ? Math.round((rank / total) * 100) : 0;
    return {
      userId: u.id,
      displayName: u.displayName,
      departmentId: u.departmentId,
      points: pointsByUser.get(u.id) ?? 0,
      rank,
      percentile,
      // positive => climbed (old rank was a bigger number than new rank)
      climbDelta: prevRank === undefined ? 0 : prevRank - rank,
    };
  });

  // ---- Department standings (avg points per ACTIVE member) ----
  // Active = has >= 1 prediction. This matters: it's avg, not sum, so big
  // departments don't win by headcount (goal.md §1).
  const deptAgg = new Map<string, { sum: number; active: number }>();
  for (const d of departments) deptAgg.set(d.id, { sum: 0, active: 0 });

  for (const u of users) {
    const agg = deptAgg.get(u.departmentId);
    if (!agg) continue; // user in an unknown department => skip
    const hasPick = (predsByUser.get(u.id)?.length ?? 0) >= 1;
    if (hasPick) {
      agg.active += 1;
      agg.sum += pointsByUser.get(u.id) ?? 0;
    }
  }

  const deptRows = departments.map((d) => {
    const agg = deptAgg.get(d.id) ?? { sum: 0, active: 0 };
    const avg = agg.active > 0 ? agg.sum / agg.active : 0;
    return {
      department: d,
      avgPoints: avg,
      activeMembers: agg.active,
      eligible: agg.active >= MIN_ACTIVE_MEMBERS,
    };
  });

  // Rank: eligible-and-higher-average first; ineligible sink to the bottom.
  const sortedDepts = [...deptRows].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.avgPoints !== a.avgPoints) return b.avgPoints - a.avgPoints;
    return a.department.name.localeCompare(b.department.name);
  });

  const departmentStandings: DepartmentStanding[] = sortedDepts.map((row, i) => {
    const rank = i + 1;
    const prevRank = previous?.departments?.[row.department.id];
    return {
      departmentId: row.department.id,
      name: row.department.name,
      color: row.department.color,
      avgPoints: Math.round(row.avgPoints * 100) / 100,
      activeMembers: row.activeMembers,
      rank,
      climbDelta: prevRank === undefined ? 0 : prevRank - rank,
      eligible: row.eligible,
    };
  });

  return { leaderboard, departments: departmentStandings };
}

/**
 * Office consensus for a single match: the share of picks for each outcome.
 * Computed from our own predictions only — never external betting odds.
 */
export function computeConsensus(
  matchId: string,
  predictions: Prediction[],
): Consensus {
  const forMatch = predictions.filter((p) => p.matchId === matchId);
  const n = forMatch.length;
  if (n === 0) {
    return { matchId, pctHome: 0, pctDraw: 0, pctAway: 0, n: 0 };
  }
  const counts: Record<Outcome, number> = { home: 0, draw: 0, away: 0 };
  for (const p of forMatch) counts[p.pick] += 1;
  const pct = (c: number) => Math.round((c / n) * 100);
  return {
    matchId,
    pctHome: pct(counts.home),
    pctDraw: pct(counts.draw),
    pctAway: pct(counts.away),
    n,
  };
}
