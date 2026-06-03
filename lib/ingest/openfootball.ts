// ============================================================================
// openfootball ingest — seed fixtures/bracket/kickoffs ONCE, for free, no key.
//
// Source of truth for the SCHEDULE (not results): openfootball/worldcup.json
// (CC0, no API key). The REAL 2026 file (104 matches) is BUNDLED at
// data/worldcup-2026.json and committed, so seeding is offline-reliable and
// reproducible — we never depend on a network fetch at runtime. The live fetch
// remains available as an OPTIONAL refresh and fails gracefully back to the
// bundled file on any problem.
//
// HONEST NOTE: openfootball is community-maintained and the 2026 file may shift
// (knockout team1/team2 are placeholders like "1A"/"W73" until the bracket
// fills). That is acceptable here: this seeds the schedule, and the organizer
// confirms real RESULTS (see app/actions/organizer.ts), which keeps the game
// accurate.
//
// Server-only: this fetches + reads a bundled file and must not ship to a
// client bundle.
// ============================================================================

import "server-only";
import type { Stage, Outcome } from "../types";
import { getStore } from "../data";
import { parseWorldcup, toSeedMatch } from "../seed";
import bundled from "../../data/worldcup-2026.json";

/** The canonical openfootball worldcup.json (master branch, CC0). */
export const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/** A normalized fixture as the seeder consumes it (shape-compatible with Match). */
export interface SeedFixture {
  id: string;
  stage: Stage;
  group: string | null;
  home: string;
  away: string;
  /** ISO-8601. */
  kickoff: string;
  /** External feed id, stable across refreshes (== id). */
  externalRef: string | null;
}

export interface FetchFixturesResult {
  fixtures: SeedFixture[];
  /** Where the fixtures came from — surfaced so callers can be honest in logs/UI. */
  source: "openfootball" | "fallback";
  /** Set when the live fetch failed and we fell back. */
  warning?: string;
}

/** True for one openfootball raw match record we can parse. */
function isRawMatch(
  raw: unknown,
): raw is {
  round: string;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
} {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.round === "string" &&
    typeof r.date === "string" &&
    typeof r.time === "string" &&
    typeof r.team1 === "string" &&
    typeof r.team2 === "string"
  );
}

/** Parse openfootball raw records into SeedFixtures, dropping any unparseable. */
function toFixtures(matches: unknown): SeedFixture[] {
  if (!Array.isArray(matches)) return [];
  const out: SeedFixture[] = [];
  for (const raw of matches) {
    if (!isRawMatch(raw)) continue;
    try {
      out.push(toSeedMatch(raw));
    } catch {
      // Unparseable kickoff etc. — skip this fixture, never abort the batch.
    }
  }
  return out;
}

/** The bundled, committed openfootball 2026 schedule (never throws). */
export function loadFallbackFixtures(): SeedFixture[] {
  return parseWorldcup(bundled as Parameters<typeof parseWorldcup>[0]);
}

/**
 * Fetch fixtures from openfootball with graceful failure. On ANY problem
 * (network, non-200, bad JSON, too few parseable matches) returns the BUNDLED
 * schedule and a warning — it never throws and never returns an empty list.
 *
 * The bundled file is already the real schedule, so this is an OPTIONAL refresh
 * (pull a newer bracket as it fills). The same parser handles both the live and
 * bundled records, so a successful fetch yields the same Match shape.
 */
export async function fetchOpenfootballFixtures(): Promise<FetchFixturesResult> {
  const fallbackFixtures = loadFallbackFixtures();
  try {
    const res = await fetch(OPENFOOTBALL_URL, {
      // Don't cache aggressively; this is called rarely (seed/cron).
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        fixtures: fallbackFixtures,
        source: "fallback",
        warning: `openfootball returned HTTP ${res.status}; using bundled schedule.`,
      };
    }
    const json: unknown = await res.json();
    const parsed = toFixtures((json as { matches?: unknown }).matches);
    // Only trust the live source if it yields a usable set; otherwise fall back.
    if (parsed.length >= 64) {
      return { fixtures: parsed, source: "openfootball" };
    }
    return {
      fixtures: fallbackFixtures,
      source: "fallback",
      warning:
        "openfootball fetch succeeded but yielded too few fixtures; using bundled schedule.",
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      fixtures: fallbackFixtures,
      source: "fallback",
      warning: `openfootball fetch failed (${reason}); using bundled schedule.`,
    };
  }
}

/** A finished-match outcome read from openfootball, keyed by external ref. */
export interface OpenfootballResult {
  /** External feed id (e.g. "af-1001"), maps to Match.externalRef. */
  externalRef: string;
  outcome: Outcome;
}

/** Derive an Outcome from a pair of scores, or null if either is missing. */
function outcomeFromScore(home: unknown, away: unknown): Outcome | null {
  if (typeof home !== "number" || typeof away !== "number") return null;
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

/**
 * Free, no-key RESULTS fallback. openfootball's worldcup.json carries scores
 * for finished matches once they're played; we read those into outcomes keyed
 * by externalRef. Graceful: ANY problem (network, non-200, no scores) resolves
 * to an empty list, never a throw. This is the secondary source — API-Football
 * is primary in the sync (lib/ingest/sync).
 *
 * HONEST NOTE: the live openfootball schema is community-maintained and may not
 * expose externalRef/scores in the shape we read. When it doesn't, this simply
 * yields [] and the organizer can still override by hand. We never guess a
 * result we can't read cleanly.
 */
export async function fetchOpenfootballResults(): Promise<OpenfootballResult[]> {
  try {
    const res = await fetch(OPENFOOTBALL_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    const matches = (json as { matches?: unknown }).matches;
    if (!Array.isArray(matches)) return [];
    const out: OpenfootballResult[] = [];
    for (const raw of matches) {
      if (typeof raw !== "object" || raw === null) continue;
      const r = raw as Record<string, unknown>;
      const externalRef = typeof r.externalRef === "string" ? r.externalRef : null;
      if (!externalRef) continue;
      // Two shapes we tolerate: flat scoreHome/scoreAway, or score.ft = [h, a].
      const score = r.score as { ft?: unknown } | undefined;
      const ft = Array.isArray(score?.ft) ? (score.ft as unknown[]) : [];
      const outcome =
        outcomeFromScore(r.scoreHome, r.scoreAway) ??
        outcomeFromScore(ft[0], ft[1]);
      if (!outcome) continue;
      out.push({ externalRef, outcome });
    }
    return out;
  } catch {
    return [];
  }
}

export interface SeedResult {
  seeded: boolean;
  source: "openfootball" | "fallback";
  fixtureCount: number;
  warning?: string;
}

/**
 * Seed fixtures/bracket/kickoffs ONCE. Delegates the actual persistence to the
 * active DataStore's `seedFromOpenfootball()` (idempotent there), then reports
 * how many fixtures the store now holds and where they came from.
 *
 * We resolve the source for HONEST reporting (and to warm the network path),
 * but the store owns idempotency — calling this repeatedly is safe.
 */
export async function seedFixtures(): Promise<SeedResult> {
  const fetched = await fetchOpenfootballFixtures();
  const store = getStore();
  await store.seedFromOpenfootball();
  const matches = await store.getMatches();
  return {
    seeded: matches.length > 0,
    source: fetched.source,
    fixtureCount: matches.length,
    warning: fetched.warning,
  };
}
