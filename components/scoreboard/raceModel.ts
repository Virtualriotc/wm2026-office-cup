// ============================================================================
// Race model — PURE. Turns DepartmentStanding[] into the two snapshots the
// hero animation needs: a "before" order and the current order, so the
// overtake (reorder + token cross) is a real transition, not a fake.
//
// Where does "before" come from?
//   - REAL: each standing carries `climbDelta` (rank change since the last
//     recompute). previousRank = rank + climbDelta. If ANY climbDelta is
//     non-zero we trust it and reconstruct the prior order from it.
//   - DEMO fallback (everything is climbDelta 0, e.g. the cold-start mock):
//     we synthesize ONE plausible swap between the current #1 and #2 lanes so
//     the hero still demonstrates a genuine overtake. Gated on `isDemo`.
//
// Token POSITIONS are emitted as 0..1 fractions, not raw points. They blend
// avgPoints with an inverse-rank fallback so lanes spread LEGIBLY even when
// every department is on 0 points (the zero-setup demo before any results are
// confirmed). The lane labels always show the true avgPoints.
// ============================================================================

import type { DepartmentStanding } from "@/lib/types";

export interface RaceLane {
  departmentId: string;
  name: string;
  color: string;
  /** 2-letter badge, e.g. "TE". */
  abbr: string;
  avgPoints: number;
  activeMembers: number;
  eligible: boolean;
  isYou: boolean;
  /** Current finishing rank (1 = leader). */
  rank: number;
  climbDelta: number;
}

export interface RaceModel {
  /** Lanes in their PRE-animation order (top = best). */
  before: RaceLane[];
  /** Lanes in their final order (top = best) — current truth. */
  after: RaceLane[];
  /** Token position 0..1 in the BEFORE snapshot, keyed by departmentId. */
  beforeFrac: Record<string, number>;
  /** Token position 0..1 in the AFTER snapshot (current truth). */
  afterFrac: Record<string, number>;
  /** The headline mover, if any (largest positive climbDelta). */
  mover: { name: string; jumped: number } | null;
  /** True when `before` was synthesized for the demo (no real climb data). */
  isDemo: boolean;
}

function abbrOf(name: string): string {
  const cleaned = name.replace(/[^A-Za-z]/g, "");
  return (cleaned.slice(0, 2) || name.slice(0, 2)).toUpperCase();
}

function toLane(s: DepartmentStanding, youDeptId: string | null): RaceLane {
  return {
    departmentId: s.departmentId,
    name: s.name,
    color: s.color,
    abbr: abbrOf(s.name),
    avgPoints: s.avgPoints,
    activeMembers: s.activeMembers,
    eligible: s.eligible,
    isYou: youDeptId !== null && s.departmentId === youDeptId,
    rank: s.rank,
    climbDelta: s.climbDelta,
  };
}

// Minimum fraction gap we try to guarantee between two adjacent ranks, so a
// lane that passes the one above it ALWAYS crosses by a visible margin instead
// of twitching when their points are nearly equal. Scaled down for large
// fields so the floor still fits inside the 0.08..1 track.
const MAX_RANK_SEP = 0.16;
function rankSep(laneCount: number): number {
  if (laneCount <= 1) return 0;
  // distribute the usable 0.08..1 band across the ranks, capped at MAX_RANK_SEP
  return Math.min(MAX_RANK_SEP, 0.92 / (laneCount - 1));
}

/**
 * Token fraction (0..1) for a lane given its rank within `order` and the
 * points spread. Blends the points-share with an inverse-rank term so that:
 *  - when points differ, position tracks points (the leader is furthest);
 *  - when points are equal/zero, position still spreads by rank so the race
 *    reads as a legible ladder instead of a flat pile.
 *
 * The points weight is deliberately modest (and capped by a rank floor below)
 * so a close-points overtake reads as a real PASS: the leader's token is held
 * at least one rank-step ahead of #2 regardless of how tight the points are.
 * Leader sits near the finish; last sits near the start, never at 0.
 */
function fractionFor(
  avg: number,
  maxAvg: number,
  orderIndex: number,
  laneCount: number,
): number {
  const pointsShare = maxAvg > 0 ? avg / maxAvg : 0;
  // inverse rank: index 0 (leader) => 1, last => small but > 0
  const rankShare = laneCount > 1 ? 1 - orderIndex / laneCount : 1;
  // Lean more on rank than before (0.7 -> 0.45) so ordering produces a
  // readable gap even when points are bunched; pure rank when all on 0.
  const w = maxAvg > 0 ? 0.45 : 0;
  const blended = w * pointsShare + (1 - w) * rankShare;
  // Hard ceiling per rank: each lane sits at least one rank-step behind the
  // finish for every rank below the leader. Because the ceiling strictly
  // decreases with rank, the passing pair always has a visible gap to cross
  // through, so a close-points overtake never collapses into a twitch.
  const rankCeiling = 1 - orderIndex * rankSep(laneCount);
  const withCeiling = Math.min(blended, rankCeiling);
  return Math.max(0.08, Math.min(1, withCeiling));
}

/**
 * Build the animation model. `standings` are assumed pre-sorted by rank
 * (scoring.ts guarantees this). `youDeptId` marks the viewer's lane.
 */
export function buildRaceModel(
  standings: DepartmentStanding[],
  youDeptId: string | null,
): RaceModel {
  // Only eligible departments get a lane (min-participants guard).
  const eligible = standings.filter((s) => s.eligible);
  const after = eligible.map((s) => toLane(s, youDeptId));
  const laneCount = after.length;
  const maxAvg = Math.max(0, ...after.map((l) => l.avgPoints));

  const afterFrac: Record<string, number> = {};
  after.forEach((lane, i) => {
    afterFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg, i, laneCount);
  });

  const hasRealMoves = after.some((l) => l.climbDelta !== 0);

  let before: RaceLane[];
  const beforeFrac: Record<string, number> = {};
  let isDemo = false;

  if (hasRealMoves) {
    // Reconstruct prior order: previousRank = rank + climbDelta.
    before = [...after].sort(
      (a, b) => a.rank + a.climbDelta - (b.rank + b.climbDelta),
    );
    before.forEach((lane, i) => {
      beforeFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg, i, laneCount);
    });
  } else if (laneCount >= 2) {
    // DEMO: stage a single overtake between the top two lanes. The #2 lane
    // started ahead of #1 and gets passed.
    isDemo = true;
    before = [...after];
    [before[0], before[1]] = [before[1]!, before[0]!];
    before.forEach((lane, i) => {
      beforeFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg, i, laneCount);
    });
  } else {
    before = [...after];
    after.forEach((lane, i) => {
      beforeFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg, i, laneCount);
    });
  }

  // Headline mover: biggest real climb. In demo mode, the staged passer (#1).
  let mover: { name: string; jumped: number } | null = null;
  if (hasRealMoves) {
    const best = [...after].sort((a, b) => b.climbDelta - a.climbDelta)[0]!;
    if (best.climbDelta > 0) mover = { name: best.name, jumped: best.climbDelta };
  } else if (isDemo && after[0]) {
    mover = { name: after[0].name, jumped: 1 };
  }

  return { before, after, beforeFrac, afterFrac, mover, isDemo };
}
