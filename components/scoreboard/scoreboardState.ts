// ============================================================================
// Scoreboard state — PURE. Two time-based decisions the scoreboard makes per
// request, kept out of the page so they're trivially unit-testable:
//
//   1. preTournament — has the cup kicked off yet? Compared against the
//      EARLIEST match kickoff (min over all fixtures). Before it, the page
//      shows a countdown; from it on, the live race. Purely time-based — no
//      manual switch, no env flag (the page is force-dynamic, so this
//      re-evaluates per request).
//
//   2. hasScoredResult — is there a REAL scored outcome on the board yet? Used
//      to gate the "mover of the week" / streak badges so they never show
//      pre-tournament or on an all-zero board. A recorded result row OR any
//      department on > 0 average points both count as a real result.
// ============================================================================

import type { Match, Result, DepartmentStanding } from "@/lib/types";

/**
 * The earliest kickoff across all fixtures, as an ISO-8601 string. Null when
 * there are no matches. Compares lexicographically — safe because all kickoffs
 * are normalized ISO-8601 UTC (`...Z`), where string order equals time order.
 */
export function computeFirstKickoff(matches: readonly Match[]): string | null {
  let earliest: string | null = null;
  for (const m of matches) {
    if (earliest === null || m.kickoff < earliest) earliest = m.kickoff;
  }
  return earliest;
}

/**
 * Pre-tournament when `now` is before the first kickoff. With no fixtures (no
 * firstKickoff) there's nothing to count down to, so we are NOT pre-tournament
 * (fall through to the normal — empty — board rather than a broken countdown).
 */
export function isPreTournament(
  firstKickoff: string | null,
  now: Date,
): boolean {
  if (firstKickoff === null) return false;
  return now.getTime() < new Date(firstKickoff).getTime();
}

/**
 * True once at least one REAL scored result exists: a recorded result row, or
 * any eligible department sitting on positive average points. Either signal
 * means the tables have woken up; both are absent pre-tournament and on a
 * cold-start all-zero board.
 */
export function hasScoredResult(
  results: readonly Result[],
  standings: readonly DepartmentStanding[],
): boolean {
  if (results.length > 0) return true;
  return standings.some((s) => s.avgPoints > 0);
}
