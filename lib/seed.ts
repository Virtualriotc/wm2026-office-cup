// ============================================================================
// Seed data + slug helpers, shared by BOTH stores (MockStore + DrizzleStore).
//
// Extracted from lib/data.ts so the Drizzle store can seed the same five
// departments and the SAME REAL FIXTURE SCHEDULE without importing the store
// module (which would create a cycle).
//
// THE SCHEDULE IS REAL. SEED_MATCHES is parsed at module load from the bundled
// data/worldcup-2026.json — the openfootball 2026 World Cup file (104 matches,
// real groups + teams + kickoff times, knockout placeholders). It is committed
// so seeding is offline-reliable and reproducible; no network at runtime.
//
// "Today" is 2026-06-02; WM 2026 runs 11 Jun – 19 Jul, ALL in the future. So at
// the real clock NOTHING is locked: the predict screen shows real upcoming
// matches and the scoreboard is empty. The populated mid-tournament snapshot
// (fake past kickoffs, results, demo colleagues) is gated behind SEED_DEMO=1
// in lib/data.ts — it is NOT the default.
// ============================================================================

import type { Department, Match, Stage } from "./types";
import worldcup2026 from "../data/worldcup-2026.json";

/**
 * The five seed departments — the race's starting lanes. Departments are
 * DYNAMIC: a joiner can also type a brand-new department name, which the store
 * creates on the fly. IDs are stable slugs ("dept-<slug>") so URLs and seeds
 * don't shift.
 */
export const DEPARTMENTS: Department[] = [
  { id: "dept-energy-ops", name: "Energy Ops", slug: "energy-ops", color: "#2F4BE0" },
  { id: "dept-energy-tech", name: "Energy Tech", slug: "energy-tech", color: "#36A85B" },
  { id: "dept-energy-invoicing", name: "Energy Invoicing", slug: "energy-invoicing", color: "#FFD23F" },
  { id: "dept-energy-cs", name: "Energy CS", slug: "energy-cs", color: "#FF7A59" },
  { id: "dept-energy-finance", name: "Energy Finance", slug: "energy-finance", color: "#6E4FE6" },
];

/** The seed department names, in display order. */
export const ALL_DEPARTMENT_NAMES = DEPARTMENTS.map((d) => d.name);

/** Palette for departments created on the fly, cycled by creation order. */
export const DYNAMIC_DEPARTMENT_COLORS = [
  "#FF5DA2",
  "#1FB6C1",
  "#9AA3B2",
  "#E0662F",
  "#5B8C2F",
  "#7E4FE6",
] as const;

/** URL/seed-safe slug from a free-form department name. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// openfootball 2026 -> our Match shape.
//
// The bundled file's match shape:
//   { round, date:"YYYY-MM-DD", time:"HH:MM UTC±N", team1, team2, group?, ground }
// Group rounds are "Matchday N" and carry real team names + "Group A".."Group L".
// Knockout rounds ("Round of 32" .. "Final") carry bracket PLACEHOLDERS as the
// team labels (e.g. "1A", "2B", "W73", "L101") — real teams arrive only as the
// bracket fills in. We keep those placeholders verbatim as the team labels; the
// human round label is derived from `stage` in the UI (stageLabel).
// ---------------------------------------------------------------------------

interface RawMatch {
  round: string;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
}

/** Map an openfootball `round` to our Stage. Third-place plays with the semis. */
function roundToStage(round: string): Stage {
  if (/^Matchday/i.test(round)) return "group";
  if (/Round of 32/i.test(round)) return "r32";
  if (/Round of 16/i.test(round)) return "r16";
  if (/Quarter-final/i.test(round)) return "qf";
  if (/Semi-final/i.test(round)) return "sf";
  if (/third place/i.test(round)) return "sf"; // consolation, same tier as SF
  if (/Final/i.test(round)) return "final";
  return "group"; // defensive default; openfootball uses only the above
}

/** "Group A" -> "A"; anything else (knockout) -> null. */
function groupLetter(group: string | undefined): string | null {
  if (!group) return null;
  const m = /^Group\s+([A-Z])$/i.exec(group.trim());
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Parse "YYYY-MM-DD" + "HH:MM UTC±N" into a UTC ISO timestamp.
 * The time is LOCAL to an offset of UTC±N, so UTC = local − offset. e.g.
 * "13:00 UTC-6" is 19:00Z. Throws on an unparseable input so a bad bundled file
 * fails loudly at load rather than seeding silent garbage kickoffs.
 */
export function parseKickoff(date: string, time: string): string {
  const tm = /^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})(?::?(\d{2}))?$/i.exec(
    time.trim(),
  );
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!tm || !dm) {
    throw new Error(`Unparseable kickoff: "${date}" "${time}"`);
  }
  const [, hh, mm, offH, offM] = tm;
  const [, y, mo, d] = dm;
  const offsetHours = Number(offH);
  const offsetMinutes = (offsetHours < 0 ? -1 : 1) * Number(offM ?? "0");
  // Local wall-clock as if it were UTC, then subtract the offset to get true UTC.
  const localAsUtcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
  );
  const utcMs = localAsUtcMs - (offsetHours * 60 + offsetMinutes) * 60_000;
  return new Date(utcMs).toISOString();
}

/** Stable, content-derived match id (survives source reordering on refresh). */
function matchId(raw: RawMatch): string {
  return `of-${slugify(raw.round)}-${slugify(raw.team1)}-${slugify(raw.team2)}`;
}

// ---------------------------------------------------------------------------
// Knockout PLACEHOLDER detection.
//
// Until a KO bracket fills, openfootball labels each KO slot with a bracket
// PLACEHOLDER instead of a real team. From the bundled 2026 file the exact
// shapes are (verified by reading data/worldcup-2026.json):
//   - group-winner / runner-up slots: "1A".."1L", "2A".."2L"   -> ^[1-9][0-9]?[A-L]$
//   - best-third-place slots:         "3A/B/C/D/F", "3C/E/F/H/I" -> ^3[A-L](/[A-L])+$
//   - winner-of-match slots:          "W73".."W102"             -> ^W\d+$
//   - loser-of-match slots:           "L101","L102"             -> ^L\d+$
// We also DEFENSIVELY recognise other common openfootball/feed placeholder
// spellings that the 2026 file doesn't currently emit but related files do
// ("R1A"-style round refs, "Winner …", "Runner-up …", "W-Group …"), so the
// guard stays correct if the bundled schedule is ever swapped or extended.
// A real team name (e.g. "Mexico", "South Korea") matches NONE of these.
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^[1-9][0-9]?[A-L]$/, //            group winner / runner-up: "1A", "2L", "12A" (defensive)
  /^3[A-L](\/[A-L])+$/, //           best-third combos: "3A/B/C/D/F"
  /^W\d+$/i, //                       winner-of-match: "W73"
  /^L\d+$/i, //                       loser-of-match: "L101"
  /^R\d+/i, //                        round-ref placeholders: "R1A" (defensive)
  /^W-?Group\b/i, //                  "W-Group A" / "WGroup A" (defensive)
  /^Group\b/i, //                     ESPN bracket descriptors: "Group A 2nd Place", "Group C Winner"
  // ESPN-style bracket descriptors appear ANYWHERE in the label, not just at the
  // start, so these match as substrings (case-insensitive). They are the
  // PRE-TOURNAMENT slot labels ESPN serves ("Group A 2nd Place", "Group C
  // Winner", "Third Place Group A/B/C/D/F", "Runner-up Group B") — NOT real teams.
  /\bWinner\b/i, //                   "Winner Group A", "Group C Winner", "Winner Match 73"
  /\bRunner[\s-]?up\b/i, //           "Runner-up Group B", "Runner Up Group B"
  /\bLoser\b/i, //                    "Loser Match 101"
  /\b2nd Place\b/i, //                "Group A 2nd Place"
  /\bThird Place\b/i, //              "Third Place Group A/B/C/D/F"
  /\bTBD\b/i, //                      "TBD" — slot not yet decided
];

/**
 * True when `name` is a KO BRACKET PLACEHOLDER rather than a real qualified
 * team. Pure: no I/O. Used to keep unresolved KO matches OUT of the predictable
 * slate (a colleague can't pick "W101 vs W102") until the feed resolves them.
 */
export function isPlaceholderTeam(name: string): boolean {
  const t = name.trim();
  if (t.length === 0) return true; // empty/blank is not a real team
  return PLACEHOLDER_PATTERNS.some((re) => re.test(t));
}

/** True when BOTH of a match's teams are real (not bracket placeholders). */
export function hasKnownTeams(match: Pick<Match, "home" | "away">): boolean {
  return !isPlaceholderTeam(match.home) && !isPlaceholderTeam(match.away);
}

/** Convert one raw openfootball match into our Match (status always scheduled). */
export function toSeedMatch(raw: RawMatch): Match {
  const id = matchId(raw);
  return {
    id,
    stage: roundToStage(raw.round),
    group: groupLetter(raw.group),
    home: raw.team1,
    away: raw.team2,
    kickoff: parseKickoff(raw.date, raw.time),
    status: "scheduled",
    // Stable external ref == id: the schedule is the only feed key we control.
    externalRef: id,
  };
}

/** Parse the whole bundled openfootball file into our Match[] (kickoff-sorted). */
export function parseWorldcup(raw: { matches: RawMatch[] }): Match[] {
  return raw.matches
    .map(toSeedMatch)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/**
 * The REAL WM 2026 schedule, parsed from the bundled openfootball file: 104
 * matches across every stage, all future-dated relative to 2026-06-02 — so the
 * default (no-flag) app starts EMPTY with nothing locked.
 */
export const SEED_MATCHES: Match[] = parseWorldcup(
  worldcup2026 as { matches: RawMatch[] },
);
