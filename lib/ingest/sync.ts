// ============================================================================
// Sync orchestration — the work behind the cron route and the manual "sync now"
// button.
//
// AUTO-INGESTION IS THE SOURCE OF TRUTH. For every match whose result is due
// (now >= kickoff + buffer) and not yet recorded, we fetch the outcome from the
// feed and store it via DataStore.recordFeedResult (source 'feed'). An organizer
// confirmation (source 'organizer') is an OPTIONAL OVERRIDE that always wins; we
// never clobber one. After ingesting we recompute the leaderboards + consensus
// and stamp the sync heartbeat.
//
// FRUGAL + IDEMPOTENT: we only touch matches that are DUE and UNrecorded, so a
// re-run does no extra network work and never double-counts. Source priority:
//   1. ESPN (free, NO key) — PRIMARY. One scoreboard call per due match-day,
//      matched to our seeded matches by UTC day + team name.
//   2. openfootball (free, no key) — fallback, matched by externalRef.
//   3. API-Football — OPTIONAL redundancy, only when API_FOOTBALL_KEY is set.
//   4. else leave it for the organizer to confirm by hand.
// With NO source yielding data the run no-ops gracefully — the organizer can
// still confirm by hand and accuracy is intact.
//
// NO LIVE POLLING: this runs on a schedule (Vercel cron) plus an optional
// manual trigger. It never opens a live feed.
//
// Server-only.
// ============================================================================

import "server-only";
import type { Match, Outcome } from "../types";
import { getStore } from "../data";
import { hasKnownTeams } from "../seed";
import { APIFootballClient } from "./apiFootball";
import {
  fetchOpenfootballResults,
  fetchOpenfootballFixtures,
} from "./openfootball";
import {
  fetchEspnResultsForDate,
  matchEspnResults,
  matchEspnKoTeams,
  resolveKoTeamsByStructure,
  type KoFeedEvent,
} from "./espn";
import { markSync, setSuggestions } from "./feedStore";

/** Result-due buffers from kickoff: 3h for group, 3.5h for knockout matches. */
const GROUP_BUFFER_MS = 3 * 60 * 60 * 1000;
const KNOCKOUT_BUFFER_MS = 3.5 * 60 * 60 * 1000;

function resultDueAt(match: Match): number {
  const kickoff = new Date(match.kickoff).getTime();
  const buffer = match.stage === "group" ? GROUP_BUFFER_MS : KNOCKOUT_BUFFER_MS;
  return kickoff + buffer;
}

/**
 * STEP 0 — resolve KO bracket placeholders to real teams from the feed.
 *
 * For every UPCOMING knockout match that still holds placeholder teams ("W101",
 * "1A"), ask the feed who actually plays that slot and, when it gives BOTH real
 * teams, overwrite the placeholders via store.setMatchTeams. We match the feed
 * event to our KO slot STRUCTURALLY — (UTC day, stage, order-within-day) — NOT
 * by team name, since ours are placeholders (see espn.resolveKoTeamsByStructure).
 *
 * Priority: ESPN (by season.slug round) -> openfootball live fixtures (by our
 * derived stage). Idempotent: only still-placeholder, not-yet-kicked-off slots
 * are touched, so a re-run after resolution is a no-op. The organizer override
 * is the backstop for any slot the feed mis-aligns. Never throws; returns the
 * count resolved so the caller can note it.
 *
 * @returns the freshly-resolved match ids (for logging) — empty when nothing to do.
 */
async function resolveKnockoutTeams(
  store: ReturnType<typeof getStore>,
  matches: Match[],
): Promise<string[]> {
  const now = Date.now();
  // Candidates: KO slots that haven't kicked off and still hold placeholders.
  const unresolved = matches.filter(
    (m) =>
      m.stage !== "group" &&
      new Date(m.kickoff).getTime() > now &&
      !hasKnownTeams(m),
  );
  if (unresolved.length === 0) return [];

  // The distinct UTC days those slots sit on — one ESPN call per day.
  const days = new Set<string>();
  for (const m of unresolved) {
    days.add(new Date(m.kickoff).toISOString().slice(0, 10).replace(/-/g, ""));
  }

  // --- PRIMARY: ESPN, by season.slug round + structural day/order matcher. ---
  const resolved = new Map<string, { home: string; away: string }>();
  for (const day of days) {
    let espn;
    try {
      espn = await fetchEspnResultsForDate(day);
    } catch {
      espn = null; // never let a feed hiccup take down the sync
    }
    if (!espn) continue;
    for (const r of matchEspnKoTeams(espn, unresolved)) {
      if (!resolved.has(r.matchId)) resolved.set(r.matchId, { home: r.home, away: r.away });
    }
  }

  // --- FALLBACK: openfootball live fixtures for any KO slot ESPN couldn't fill. ---
  const stillMissing = unresolved.filter((m) => !resolved.has(m.id));
  if (stillMissing.length > 0) {
    try {
      const { fixtures } = await fetchOpenfootballFixtures();
      const events: KoFeedEvent[] = fixtures.map((f) => ({
        stage: f.stage,
        kickoff: f.kickoff,
        home: f.home,
        away: f.away,
      }));
      for (const r of resolveKoTeamsByStructure(events, stillMissing)) {
        if (!resolved.has(r.matchId)) resolved.set(r.matchId, { home: r.home, away: r.away });
      }
    } catch {
      // openfootball unreachable/garbage — organizer override is the backstop.
    }
  }

  // --- apply: overwrite the placeholders; skip anything we couldn't fill. ---
  const applied: string[] = [];
  for (const [matchId, teams] of resolved) {
    try {
      await store.setMatchTeams(matchId, teams.home, teams.away);
      // Reflect into the in-memory snapshot so the rest of this pass sees it.
      const m = matches.find((x) => x.id === matchId);
      if (m) {
        m.home = teams.home;
        m.away = teams.away;
      }
      applied.push(matchId);
    } catch {
      // Skip a single bad slot rather than fail the whole pass.
    }
  }
  return applied;
}

export interface SyncResult {
  ok: true;
  /** How many KO slots had their placeholder teams resolved this run. */
  koResolved: number;
  /** How many feed results were ingested this run. */
  ingested: number;
  /** How many due matches still have no result (feed had nothing for them). */
  pending: number;
  /** Human-readable, honest status for logs + the organizer heartbeat. */
  note: string;
  /** "no-source" | "ok" | "degraded" — coarse status for callers/tests. */
  status: "no-source" | "ok" | "degraded";
}

/**
 * Run one sync pass.
 *
 * Flow:
 *  1. Compute the DUE-and-UNrecorded matches (now >= kickoff + buffer, no result).
 *     If none, no-op (still stamp the heartbeat).
 *  2. Pull outcomes in priority order, stopping per-match once one source has it:
 *       ESPN (primary, by UTC day + team name) -> openfootball (by externalRef)
 *       -> API-Football (only if API_FOOTBALL_KEY set, by externalRef). Every
 *       source degrades to empty gracefully and never throws.
 *  3. recordFeedResult for each due match we found an outcome for (source 'feed',
 *     never overriding an organizer confirmation).
 *  4. Recompute leaderboards (idempotent) and stamp the heartbeat.
 *
 * Always resolves (never throws) so a cron hit can't error out.
 */
export async function runSync(matchday?: string): Promise<SyncResult> {
  const store = getStore();

  let matches: Match[];
  let recordedMatchIds: Set<string>;
  try {
    const [allMatches, results] = await Promise.all([
      store.getMatches(),
      store.getResults(),
    ]);
    matches = allMatches;
    recordedMatchIds = new Set(results.map((r) => r.matchId));
  } catch {
    // A half-configured Neon deploy can throw on reads; don't take down the cron.
    const note = "Store unavailable; skipped this sync pass.";
    markSync(note);
    return { ok: true, koResolved: 0, ingested: 0, pending: 0, note, status: "degraded" };
  }

  // STEP 0 (before results): resolve any upcoming KO slots whose placeholders
  // the feed can now fill. Mutates `matches` in place so the rest of the pass
  // sees the real teams. Never throws.
  let koResolved = 0;
  try {
    koResolved = (await resolveKnockoutTeams(store, matches)).length;
  } catch {
    // Defensive: KO resolution must never break result ingestion.
  }

  const now = Date.now();
  const due = matches.filter(
    (m) => now >= resultDueAt(m) && !recordedMatchIds.has(m.id),
  );

  // Nothing due — cheapest possible pass, no further network calls.
  if (due.length === 0) {
    const note =
      koResolved > 0
        ? `Resolved ${koResolved} knockout fixture${koResolved === 1 ? "" : "s"} from the feed. No results due yet.`
        : "No matches due for a result yet. Nothing to ingest.";
    markSync(note);
    await store.markSync(note);
    return { ok: true, koResolved, ingested: 0, pending: 0, note, status: "ok" };
  }

  // Resolved outcome per DUE match id, filled by source priority below. We key
  // by matchId (not externalRef) because ESPN matches by name+day, not by ref.
  const outcomeByMatchId = new Map<string, Outcome>();
  let degraded = false;
  let usedSource: "espn" | "openfootball" | "api-football" | "none" = "none";

  // --- 1. PRIMARY: ESPN (free, no key). One scoreboard call per due match-day. ---
  // Collect the distinct UTC days the due matches kick off on, then ask ESPN
  // once per day and resolve events to our match ids via the name+day matcher.
  const dueDays = new Set<string>();
  for (const m of due) {
    dueDays.add(new Date(m.kickoff).toISOString().slice(0, 10).replace(/-/g, ""));
  }
  let espnFailed = false;
  for (const day of dueDays) {
    const espnResults = await fetchEspnResultsForDate(day);
    if (espnResults === null) {
      espnFailed = true; // network/HTTP/parse problem for this day — fall back.
      continue;
    }
    for (const { matchId: id, outcome } of matchEspnResults(espnResults, due)) {
      if (!outcomeByMatchId.has(id)) {
        outcomeByMatchId.set(id, outcome);
        if (usedSource === "none") usedSource = "espn";
      }
    }
  }
  if (espnFailed) degraded = true;

  // externalRef -> matchId, restricted to DUE matches still missing (frugal).
  const dueByRef = new Map<string, string>();
  for (const m of due) {
    if (m.externalRef && !outcomeByMatchId.has(m.id)) dueByRef.set(m.externalRef, m.id);
  }

  // --- 2. FALLBACK: openfootball (free, no key) for any due match still missing ---
  if (dueByRef.size > 0) {
    const ofResults = await fetchOpenfootballResults();
    for (const r of ofResults) {
      const id = dueByRef.get(r.externalRef);
      if (id && !outcomeByMatchId.has(id)) {
        outcomeByMatchId.set(id, r.outcome);
        if (usedSource === "none") usedSource = "openfootball";
        dueByRef.delete(r.externalRef);
      }
    }
  }

  // --- 3. OPTIONAL: API-Football, only when a key is set, for anything still missing. ---
  const client = APIFootballClient.fromEnv();
  if (client && dueByRef.size > 0) {
    const fetched = await client.getResults(matchday);
    if (fetched && fetched.suggestions.length > 0) {
      for (const s of fetched.suggestions) {
        const id = dueByRef.get(s.externalRef);
        if (id && !outcomeByMatchId.has(id)) {
          outcomeByMatchId.set(id, s.outcome);
          if (usedSource === "none") usedSource = "api-football";
        }
      }
    } else if (fetched?.warning) {
      degraded = true;
    }
  }

  // --- ingest: store each found outcome as an authoritative feed result ---
  let ingested = 0;
  for (const m of due) {
    const outcome = outcomeByMatchId.get(m.id);
    if (!outcome) continue;
    try {
      await store.recordFeedResult(m.id, outcome);
      ingested += 1;
    } catch {
      // Skip a single bad match rather than fail the whole pass.
    }
  }

  // Mirror what we ingested as feed "suggestions" too, so the organizer screen
  // (which reads feedStore) shows the feed's call alongside the override option.
  if (ingested > 0) {
    setSuggestions(
      due
        .filter((m) => outcomeByMatchId.has(m.id))
        .map((m) => ({ matchId: m.id, outcome: outcomeByMatchId.get(m.id)! })),
    );
  }

  // Recompute is read-derived in the mock; warm it so derived state is fresh.
  try {
    await store.getLeaderboard();
  } catch {
    /* warm-up only; never fail the sync over it */
  }

  const pending = due.length - ingested;
  const note =
    ingested > 0
      ? `Auto-ingested ${ingested} result${ingested === 1 ? "" : "s"} from ${usedSource} (ESPN-primary). Organizer can override any call.`
      : degraded
        ? "Results are due but every results source was unreachable or had nothing usable yet. Organizer can confirm by hand."
        : "Results are due but the feed had nothing for them yet (not final on ESPN/openfootball). Organizer can confirm by hand.";

  markSync(note);
  await store.markSync(note);

  // ESPN + openfootball are ALWAYS attempted (no key needed), so there is always
  // a source: "no-source" would only mean we couldn't even try, which can't
  // happen here. "degraded" means a source we tried errored out.
  return {
    ok: true,
    koResolved,
    ingested,
    pending,
    note,
    status: ingested > 0 ? "ok" : degraded ? "degraded" : "ok",
  };
}
