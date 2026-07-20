// ============================================================================
// FINALE — PURE. What the scoreboard shows once the cup is actually over.
//
// The scoreboard has always been a time-based switch with no manual flag:
// before the first kickoff it counts down, after it it races. This is the
// third and last state — the final has been played, nothing can move again,
// so a "live race" with a green heartbeat would be a lie.
//
// Everything here is derived from rows we already store (matches, results,
// predictions, users). No new tables, no new ingest. Same shape as
// lib/integrity.ts: a pure function both stores call, so the mock store and
// Postgres can never disagree about who won.
// ============================================================================

import { STAGE_POINTS } from "./scoring";
import type { Match, Outcome, Stage } from "./types";

/** Minimum picks on a match before it can be the "hardest call" / "banker".
 *  Keeps a 0-of-3 fluke from outranking a 0-of-51 genuine blindside. */
const MIN_SAMPLE = 10;

/** How many co-winners we name before collapsing to "+N more". */
const MAX_NAMED = 3;

/** One match, plus how the office called it. */
export interface CalledMatch {
  matchId: string;
  home: string;
  away: string;
  stage: Stage;
  outcome: Outcome;
  /** Winning team, or null on a draw. */
  winner: string | null;
  /** How many people picked the outcome that actually happened. */
  ok: number;
  /** How many people picked this match at all. */
  n: number;
}

/** Top knockout caller(s), measured against EVERY knockout tie — a match you
 *  never picked counts against you, same as a wrong pick. */
export interface KnockoutRun {
  names: string[];
  /** Co-winners beyond the named ones. */
  more: number;
  ok: number;
  total: number;
}

/** Whoever led a phase of the cup on points, with any co-leaders. */
export interface PhaseLeader {
  names: string[];
  more: number;
  points: number;
}

/** One viewer's own tournament, derived from their picks alone. */
export interface PersonalFinale {
  userId: string;
  displayName: string;
  /** Matches they picked that ended up scored. */
  picked: number;
  correct: number;
  /** Their own share of picks that came in, 0–100, rounded. */
  accuracyPct: number;
  /** Correct knockout calls, against every KO tie on the slate. */
  koCorrect: number;
  koTotal: number;
  /** Longest run of correct picks in kickoff order. */
  longestStreak: number;
  /** The correct call the fewest colleagues also made — their sharpest read. */
  bestCall: CalledMatch | null;
}

export interface FinaleReport {
  /** Winner of the final. Null if the stored outcome is a draw — we record an
   *  outcome, not a shootout, so we refuse to guess a champion. */
  champion: string | null;
  runnerUp: string | null;
  /** Winner of the third-place play-off, when the slate has one. */
  third: string | null;
  /** The final itself, and how the office called it. */
  final: CalledMatch;
  players: number;
  picks: number;
  correct: number;
  /** Office-wide share of picks that came in, 0–100, rounded. */
  accuracyPct: number;
  /** Fewest people called it right. */
  hardest: CalledMatch | null;
  /** Most people called it right. */
  banker: CalledMatch | null;
  bestKnockout: KnockoutRun | null;
  /** Who topped the table on group-stage points alone. */
  groupStageLeader: PhaseLeader | null;
  /** Who scored most across the knockout rounds. */
  knockoutLeader: PhaseLeader | null;
  /** Rank after the group stage, by userId — lets the UI say "4th after the
   *  groups, first at the end". Ties share a rank. */
  groupStageRank: Record<string, number>;
  /** Matches a real crowd called unanimously right, and unanimously wrong. */
  unanimousRight: number;
  unanimousWrong: number;
  /** Every point scored by everyone, all cup. */
  totalPoints: number;
  /** The viewer's own tournament. Null when signed out, or when the viewer
   *  never made a pick that got scored. */
  personal: PersonalFinale | null;
}

export interface FinaleInput {
  matches: readonly Match[];
  results: readonly { matchId: string; outcome: Outcome }[];
  predictions: readonly { userId: string; matchId: string; pick: Outcome }[];
  users: readonly { id: string; displayName: string }[];
  /** Whose personal card to build. Omit for the office-only report. */
  viewerId?: string | null;
}

/** The team an outcome hands the win to, or null on a draw. */
function winnerOf(m: Match, outcome: Outcome): string | null {
  if (outcome === "home") return m.home;
  if (outcome === "away") return m.away;
  return null;
}

/**
 * The cup is over once the FINAL has a recorded result. That is the one
 * unambiguous end signal — every other stage can still have a fixture pending.
 */
export function isTournamentOver(
  matches: readonly Match[],
  results: readonly { matchId: string }[],
): boolean {
  const final = matches.find((m) => m.stage === "final");
  if (!final) return false;
  return results.some((r) => r.matchId === final.id);
}

/**
 * The full-time report. Returns null while the cup is still running, so the
 * caller can simply branch on it.
 */
export function computeFinale(input: FinaleInput): FinaleReport | null {
  const { matches, results, predictions, users } = input;
  if (!isTournamentOver(matches, results)) return null;

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const outcomeById = new Map(results.map((r) => [r.matchId, r.outcome]));
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));

  // --- how the office called every scored match ---
  const tallies = new Map<string, { ok: number; n: number }>();
  let picks = 0;
  let correct = 0;
  for (const p of predictions) {
    const outcome = outcomeById.get(p.matchId);
    if (outcome === undefined) continue; // unscored match — not judgeable
    picks++;
    const hit = p.pick === outcome;
    if (hit) correct++;
    const t = tallies.get(p.matchId) ?? { ok: 0, n: 0 };
    t.n++;
    if (hit) t.ok++;
    tallies.set(p.matchId, t);
  }

  const called: CalledMatch[] = [];
  for (const [matchId, t] of tallies) {
    const m = matchById.get(matchId);
    const outcome = outcomeById.get(matchId);
    if (!m || outcome === undefined) continue;
    called.push({
      matchId,
      home: m.home,
      away: m.away,
      stage: m.stage,
      outcome,
      winner: winnerOf(m, outcome),
      ok: t.ok,
      n: t.n,
    });
  }

  // --- the final, the runner-up, the third-place play-off ---
  // `!` is safe: isTournamentOver already proved a final with a result exists.
  const finalMatch = matches.find((m) => m.stage === "final")!;
  const finalOutcome = outcomeById.get(finalMatch.id)!;
  const finalTally = tallies.get(finalMatch.id) ?? { ok: 0, n: 0 };
  const final: CalledMatch = {
    matchId: finalMatch.id,
    home: finalMatch.home,
    away: finalMatch.away,
    stage: finalMatch.stage,
    outcome: finalOutcome,
    winner: winnerOf(finalMatch, finalOutcome),
    ok: finalTally.ok,
    n: finalTally.n,
  };
  const champion = final.winner;
  const runnerUp =
    champion === null
      ? null
      : champion === finalMatch.home
        ? finalMatch.away
        : finalMatch.home;

  // The third-place play-off is stored under stage "sf" alongside the two real
  // semis. It is the only one of them contested by NEITHER finalist.
  const finalists = new Set([finalMatch.home, finalMatch.away]);
  const thirdMatch = matches.find(
    (m) =>
      m.stage === "sf" && !finalists.has(m.home) && !finalists.has(m.away),
  );
  const thirdOutcome = thirdMatch ? outcomeById.get(thirdMatch.id) : undefined;
  const third =
    thirdMatch && thirdOutcome !== undefined
      ? winnerOf(thirdMatch, thirdOutcome)
      : null;

  // --- hardest call / banker ---
  // Tie-break on sample size: 0-of-51 fooled more people than 0-of-27, and is
  // the better story.
  const rated = called.filter((c) => c.n >= MIN_SAMPLE);
  const byRate = [...rated].sort((a, b) => {
    const ra = a.ok / a.n;
    const rb = b.ok / b.n;
    return ra - rb || b.n - a.n;
  });
  const hardest = byRate[0] ?? null;
  const banker =
    [...rated].sort((a, b) => {
      const ra = a.ok / a.n;
      const rb = b.ok / b.n;
      return rb - ra || b.n - a.n;
    })[0] ?? null;

  // --- best knockout run ---
  // Scored against every knockout tie on the slate, not against picks made, so
  // skipping a round is not a free pass.
  const koIds = new Set(
    matches.filter((m) => m.stage !== "group").map((m) => m.id),
  );
  const koHits = new Map<string, number>();
  for (const p of predictions) {
    if (!koIds.has(p.matchId)) continue;
    if (outcomeById.get(p.matchId) !== p.pick) continue;
    koHits.set(p.userId, (koHits.get(p.userId) ?? 0) + 1);
  }
  let bestKnockout: KnockoutRun | null = null;
  if (koIds.size > 0 && koHits.size > 0) {
    const top = Math.max(...koHits.values());
    const winners = [...koHits.entries()]
      .filter(([, ok]) => ok === top)
      .map(([userId]) => nameById.get(userId))
      .filter((n): n is string => Boolean(n))
      .sort((a, b) => a.localeCompare(b));
    bestKnockout = {
      names: winners.slice(0, MAX_NAMED),
      more: Math.max(0, winners.length - MAX_NAMED),
      ok: top,
      total: koIds.size,
    };
  }

  // --- how the cup was won: group-stage form vs knockout form ---
  // Split every correct pick's points by phase. The interesting story is
  // usually not who led wire-to-wire but who ran someone down after it.
  const groupPoints = new Map<string, number>();
  const koPoints = new Map<string, number>();
  for (const p of predictions) {
    const outcome = outcomeById.get(p.matchId);
    if (outcome === undefined || outcome !== p.pick) continue;
    const m = matchById.get(p.matchId);
    if (!m) continue;
    const pts = STAGE_POINTS[m.stage];
    const bucket = m.stage === "group" ? groupPoints : koPoints;
    bucket.set(p.userId, (bucket.get(p.userId) ?? 0) + pts);
  }

  const leaderFrom = (tally: Map<string, number>): PhaseLeader | null => {
    if (tally.size === 0) return null;
    const top = Math.max(...tally.values());
    const names = [...tally.entries()]
      .filter(([, v]) => v === top)
      .map(([userId]) => nameById.get(userId))
      .filter((n): n is string => Boolean(n))
      .sort((a, b) => a.localeCompare(b));
    return {
      names: names.slice(0, MAX_NAMED),
      more: Math.max(0, names.length - MAX_NAMED),
      points: top,
    };
  };

  // Standard competition ranking: equal points share a rank.
  const groupStageRank: Record<string, number> = {};
  const byGroupPoints = [...groupPoints.entries()].sort((a, b) => b[1] - a[1]);
  let rank = 0;
  let prevPoints: number | null = null;
  byGroupPoints.forEach(([userId, pts], i) => {
    if (prevPoints === null || pts < prevPoints) {
      rank = i + 1;
      prevPoints = pts;
    }
    groupStageRank[userId] = rank;
  });

  const sum = (t: Map<string, number>) =>
    [...t.values()].reduce((a, b) => a + b, 0);

  // "Everyone got it right/wrong" only means something with a real crowd.
  const unanimousRight = rated.filter((c) => c.ok === c.n).length;
  const unanimousWrong = rated.filter((c) => c.ok === 0).length;

  // --- the viewer's own tournament ---
  const personal = input.viewerId
    ? computePersonal({
        viewerId: input.viewerId,
        predictions,
        outcomeById,
        matchById,
        calledById: new Map(called.map((c) => [c.matchId, c])),
        koIds,
        nameById,
      })
    : null;

  return {
    champion,
    runnerUp,
    third,
    final,
    players: users.length,
    picks,
    correct,
    accuracyPct: picks === 0 ? 0 : Math.round((correct / picks) * 100),
    hardest,
    banker,
    bestKnockout,
    groupStageLeader: leaderFrom(groupPoints),
    knockoutLeader: leaderFrom(koPoints),
    groupStageRank,
    unanimousRight,
    unanimousWrong,
    totalPoints: sum(groupPoints) + sum(koPoints),
    personal,
  };
}

/**
 * One viewer's card. Split out only for readability — it reuses the tallies
 * computeFinale already built, so the personal stats never cost a second pass
 * over the predictions or a second query.
 */
function computePersonal(args: {
  viewerId: string;
  predictions: readonly { userId: string; matchId: string; pick: Outcome }[];
  outcomeById: Map<string, Outcome>;
  matchById: Map<string, Match>;
  calledById: Map<string, CalledMatch>;
  koIds: Set<string>;
  nameById: Map<string, string>;
}): PersonalFinale | null {
  const { viewerId, outcomeById, matchById, calledById, koIds, nameById } = args;

  const mine = args.predictions.filter(
    (p) => p.userId === viewerId && outcomeById.has(p.matchId),
  );
  if (mine.length === 0) return null;

  let correct = 0;
  let koCorrect = 0;
  let bestCall: CalledMatch | null = null;
  for (const p of mine) {
    if (outcomeById.get(p.matchId) !== p.pick) continue;
    correct++;
    if (koIds.has(p.matchId)) koCorrect++;
    // Sharpest read = the correct call the fewest colleagues shared. Ties break
    // toward the bigger crowd they beat.
    const c = calledById.get(p.matchId);
    if (!c) continue;
    if (
      bestCall === null ||
      c.ok / c.n < bestCall.ok / bestCall.n ||
      (c.ok / c.n === bestCall.ok / bestCall.n && c.n > bestCall.n)
    ) {
      bestCall = c;
    }
  }

  // Longest correct run, in kickoff order — the streak as it was actually lived.
  const chronological = [...mine].sort((a, b) => {
    const ka = matchById.get(a.matchId)?.kickoff;
    const kb = matchById.get(b.matchId)?.kickoff;
    return new Date(ka ?? 0).getTime() - new Date(kb ?? 0).getTime();
  });
  let longestStreak = 0;
  let run = 0;
  for (const p of chronological) {
    if (outcomeById.get(p.matchId) === p.pick) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  return {
    userId: viewerId,
    displayName: nameById.get(viewerId) ?? "You",
    picked: mine.length,
    correct,
    accuracyPct: Math.round((correct / mine.length) * 100),
    koCorrect,
    koTotal: koIds.size,
    longestStreak,
    bestCall,
  };
}

/** Points a perfect card would have scored — the ceiling nobody reached. */
export function perfectScore(matches: readonly Match[]): number {
  return matches.reduce((sum, m) => sum + STAGE_POINTS[m.stage], 0);
}
