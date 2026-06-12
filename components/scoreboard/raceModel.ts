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

/**
 * Token fraction (0..1) for a lane: PROPORTIONAL to its average points, so the
 * bars read honestly — equal scores sit at equal positions, and the gap between
 * two lanes matches the real gap in their averages. (The old version blended in
 * an inverse-rank term, which spread tied scores far apart — confusing next to
 * identical labels.) Before any points exist (maxAvg 0) the lanes sit level; a
 * small floor keeps a zero-point lane visible.
 */
function fractionFor(avg: number, maxAvg: number): number {
  if (maxAvg <= 0) return 0.5;
  return Math.max(0.06, Math.min(1, avg / maxAvg));
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
  after.forEach((lane) => {
    afterFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg);
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
    before.forEach((lane) => {
      beforeFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg);
    });
  } else if (laneCount >= 2) {
    // DEMO: stage a single overtake between the top two lanes. The #2 lane
    // started ahead of #1 and gets passed.
    isDemo = true;
    before = [...after];
    [before[0], before[1]] = [before[1]!, before[0]!];
    before.forEach((lane) => {
      beforeFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg);
    });
  } else {
    before = [...after];
    after.forEach((lane) => {
      beforeFrac[lane.departmentId] = fractionFor(lane.avgPoints, maxAvg);
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
