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
  Match,
  LeaderboardRow,
  DepartmentStanding,
  Consensus,
  Department,
  Awards,
  AwardWinner,
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
  // Largest-remainder rounding so the three shares always sum to EXACTLY 100.
  // Independent Math.round can yield 99 or 101 (e.g. 1/3 each -> 33/33/33 = 99),
  // which leaves a visible gap (or overflow) in the consensus bar.
  const raw = [counts.home, counts.draw, counts.away].map((c) => (c / n) * 100);
  const floors = raw.map((v) => Math.floor(v));
  const remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const byFrac = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const pcts = [...floors];
  for (let k = 0; k < remainder && k < byFrac.length; k++) {
    const idx = byFrac[k]!.i;
    pcts[idx] = pcts[idx]! + 1;
  }
  return {
    matchId,
    pctHome: pcts[0]!,
    pctDraw: pcts[1]!,
    pctAway: pcts[2]!,
    n,
  };
}

// ============================================================================
// Scoreboard superlatives ("awards"). Pure + deterministic for a given input.
// ============================================================================

export interface AwardsInput {
  users: User[];
  predictions: Prediction[];
  results: Result[];
  matches: Match[];
  departments: Department[];
}

/** Minimum picks before someone qualifies for the Mainstream Picker award. */
const MAINSTREAM_MIN_PICKS = 5;
/** Minimum run length to be honoured as a Hot Streak. */
const HOT_STREAK_MIN = 2;

export function computeAwards(input: AwardsInput): Awards {
  const { users, predictions, results, matches, departments } = input;

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const userName = new Map(users.map((u) => [u.id, u.displayName]));
  const userDept = new Map(
    users.map((u) => [u.id, deptName.get(u.departmentId) ?? u.departmentId]),
  );
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const resultBy = new Map(results.map((r) => [r.matchId, r.outcome]));

  // Build an award from the set of users tied at the top value. Sorting the ids
  // makes the primary + co-winner order DETERMINISTIC regardless of input order,
  // so a tie shows the same names on every page load.
  const named = (id: string) => ({
    displayName: userName.get(id) ?? "—",
    departmentName: userDept.get(id) ?? "—",
  });
  const mkAward = (userIds: string[], detail: string): AwardWinner | null => {
    if (userIds.length === 0) return null;
    const [first, ...rest] = [...userIds].sort();
    return { ...named(first!), detail, sharedWith: rest.map(named) };
  };

  const byUser = new Map<string, Prediction[]>();
  for (const p of predictions) {
    const arr = byUser.get(p.userId);
    if (arr) arr.push(p);
    else byUser.set(p.userId, [p]);
  }

  // ---- Mainstream Picker: backs the office-majority outcome most often ----
  const counts = new Map<string, Record<Outcome, number>>();
  for (const p of predictions) {
    let c = counts.get(p.matchId);
    if (!c) {
      c = { home: 0, draw: 0, away: 0 };
      counts.set(p.matchId, c);
    }
    c[p.pick] += 1;
  }
  const majority = new Map<string, Outcome>();
  for (const [matchId, c] of counts) {
    const ranked: [Outcome, number][] = [
      ["home", c.home],
      ["draw", c.draw],
      ["away", c.away],
    ];
    ranked.sort((a, b) => b[1] - a[1]);
    if (ranked[0]![1] > ranked[1]![1]) majority.set(matchId, ranked[0]![0]);
  }
  // Qualify on TOTAL picks (so a couple of tied matches can't push someone below
  // the bar); rate is the share of their majority-decided picks that matched.
  const rates: { userId: string; rate: number }[] = [];
  for (const [userId, preds] of byUser) {
    if (preds.length < MAINSTREAM_MIN_PICKS) continue;
    let considered = 0;
    let matched = 0;
    for (const p of preds) {
      const maj = majority.get(p.matchId);
      if (maj === undefined) continue;
      considered += 1;
      if (p.pick === maj) matched += 1;
    }
    if (considered === 0) continue;
    rates.push({ userId, rate: matched / considered });
  }
  let mainstream: AwardWinner | null = null;
  if (rates.length > 0) {
    const max = Math.max(...rates.map((r) => r.rate));
    const winners = rates
      .filter((r) => Math.abs(r.rate - max) < 1e-9)
      .map((r) => r.userId);
    mainstream = mkAward(winners, `${Math.round(max * 100)}% with the crowd`);
  }

  // ---- Star of the Matchday: most points in the latest completed matchday ----
  const dayOf = (m: Match) => m.kickoff.slice(0, 10);
  const allDays = [...new Set(matches.map(dayOf))].sort();
  const dayNumber = new Map(allDays.map((d, i) => [d, i + 1]));
  const completedDays = [
    ...new Set(matches.filter((m) => resultBy.has(m.id)).map(dayOf)),
  ].sort();
  let star: AwardWinner | null = null;
  if (completedDays.length > 0) {
    const latestDay = completedDays[completedDays.length - 1]!;
    const dayMatchIds = new Set(
      matches
        .filter((m) => dayOf(m) === latestDay && resultBy.has(m.id))
        .map((m) => m.id),
    );
    const pts = new Map<string, number>();
    for (const p of predictions) {
      if (!dayMatchIds.has(p.matchId)) continue;
      const outcome = resultBy.get(p.matchId);
      const stage = matchById.get(p.matchId)?.stage;
      if (outcome === undefined || stage === undefined) continue;
      if (p.pick === outcome) {
        pts.set(p.userId, (pts.get(p.userId) ?? 0) + STAGE_POINTS[stage]);
      }
    }
    if (pts.size > 0) {
      const max = Math.max(...pts.values());
      if (max > 0) {
        const winners = [...pts.entries()]
          .filter(([, t]) => t === max)
          .map(([u]) => u);
        const md = dayNumber.get(latestDay);
        star = mkAward(
          winners,
          `${max} pt${max === 1 ? "" : "s"}${md ? ` · Matchday ${md}` : ""}`,
        );
      }
    }
  }

  // ---- Hot Streak: longest run of consecutive correct picks anywhere on their
  // card (chronological by kickoff). A later miss doesn't erase a past run. ----
  const streaks: { userId: string; len: number }[] = [];
  for (const [userId, preds] of byUser) {
    const completed = preds
      .filter((p) => resultBy.has(p.matchId) && matchById.has(p.matchId))
      .sort((a, b) =>
        matchById
          .get(a.matchId)!
          .kickoff.localeCompare(matchById.get(b.matchId)!.kickoff),
      );
    let run = 0;
    let longest = 0;
    for (const p of completed) {
      if (p.pick === resultBy.get(p.matchId)) {
        run += 1;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
    }
    if (longest > 0) streaks.push({ userId, len: longest });
  }
  let hotStreak: AwardWinner | null = null;
  if (streaks.length > 0) {
    const max = Math.max(...streaks.map((s) => s.len));
    if (max >= HOT_STREAK_MIN) {
      const winners = streaks.filter((s) => s.len === max).map((s) => s.userId);
      hotStreak = mkAward(winners, `${max} in a row`);
    }
  }

  return { mainstream, star, hotStreak };
}
