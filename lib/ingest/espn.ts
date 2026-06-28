// ============================================================================
// ESPN scoreboard client — the KEYLESS PRIMARY results source.
//
// WHY ESPN: API-Football's owner key is dead and its free tier likely excludes
// WC2026. ESPN's site scoreboard API is FREE, needs NO key/header, and already
// serves real WC2026 fixtures + (when played) live/final results. So this is
// the primary results source in the sync; openfootball is the fallback and
// API-Football is now optional redundancy.
//
//   GET https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD
//   - one call per match-day (no key, no auth header)
//   - send a normal browser-ish User-Agent
//   - treat any 4xx/5xx / parse error as "fall back" (return null)
//
// MAPPING (verified against real responses):
//   events[].date                         ISO UTC kickoff (e.g. "2026-06-11T19:00Z")
//   events[].competitions[0].status.type  { state 'pre'|'in'|'post', completed:bool, detail 'FT'|'FT-Pens'|clock }
//   competitions[0].competitors[]         each { homeAway:'home'|'away', team.{displayName,abbreviation}, score:string, winner:bool }
//   events[].season.slug                  stage slug ('group-stage'|'round-of-32'|...|'final')
//
// OUTCOME: ONLY when status.type.completed === true. Then the side whose
// `winner` flag is true wins ('home'|'away'); if neither is flagged it's a
// 'draw'. Penalties (detail 'FT-Pens') leave the regulation scores LEVEL but
// the winner flag still marks the advancer — so we trust the flag, not the
// score. completed === false (scheduled/in-play) => outcome null.
//
// DEFENSIVE: any network/parse/shape problem => return null so the sync caller
// degrades to openfootball / organizer override. This client NEVER throws.
//
// Server-only.
// ============================================================================

import "server-only";
import type { Match, Outcome, Stage } from "../types";
import { isPlaceholderTeam } from "../seed";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

/** A browser-ish UA: the bare fetch UA gets flaky responses from ESPN. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const TIMEOUT_MS = 8000;

/** One ESPN event, normalized to the fields the matcher + sync care about. */
export interface EspnResult {
  /** ISO-8601 UTC kickoff straight from events[].date. */
  dateUtc: string;
  /** ESPN home/away team display names (e.g. "Mexico", "South Korea"). */
  homeName: string;
  awayName: string;
  /** ESPN abbreviations (e.g. "MEX", "RSA") — handy for logs/diagnostics. */
  homeAbbr: string | null;
  awayAbbr: string | null;
  /** status.type.completed: true only once the match is final. */
  completed: boolean;
  /**
   * Confirmed outcome, or null. NULL unless completed === true. On penalties
   * (detail 'FT-Pens') the regulation score is level but the winner flag marks
   * the advancer, so this reads the flag, not the score: home winner => 'home',
   * away winner => 'away', neither flagged => 'draw'.
   */
  outcome: Outcome | null;
  /** status.type.detail, e.g. 'FT' | 'FT-Pens' | a live clock. */
  detail: string | null;
  /** events[].season.slug, e.g. 'group-stage' | 'round-of-32' | 'final'. Used to
   *  map a KO event to the right stage when our seeded teams are placeholders. */
  seasonSlug: string | null;
}

// --- ESPN JSON shape (only the bits we read) -------------------------------

interface EspnTeam {
  displayName?: unknown;
  abbreviation?: unknown;
}
interface EspnCompetitor {
  homeAway?: unknown;
  winner?: unknown;
  score?: unknown;
  team?: EspnTeam;
}
interface EspnStatusType {
  state?: unknown;
  completed?: unknown;
  detail?: unknown;
}
interface EspnCompetition {
  status?: { type?: EspnStatusType };
  competitors?: unknown;
}
interface EspnSeason {
  slug?: unknown;
}
interface EspnEvent {
  date?: unknown;
  competitions?: unknown;
  season?: EspnSeason;
}
interface EspnScoreboard {
  events?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Find the home/away competitor in an ESPN competitors array. */
function pickCompetitor(
  competitors: unknown,
  side: "home" | "away",
): EspnCompetitor | null {
  if (!Array.isArray(competitors)) return null;
  for (const c of competitors) {
    if (c && typeof c === "object" && (c as EspnCompetitor).homeAway === side) {
      return c as EspnCompetitor;
    }
  }
  return null;
}

/** Normalize one ESPN event into an EspnResult, or null if unparseable. */
function toEspnResult(raw: unknown): EspnResult | null {
  if (!raw || typeof raw !== "object") return null;
  const ev = raw as EspnEvent;

  const dateUtc = asString(ev.date);
  if (!dateUtc) return null;

  const comps = ev.competitions;
  if (!Array.isArray(comps) || comps.length === 0) return null;
  const comp = comps[0] as EspnCompetition;

  const home = pickCompetitor(comp.competitors, "home");
  const away = pickCompetitor(comp.competitors, "away");
  if (!home || !away) return null;

  const homeName = asString(home.team?.displayName);
  const awayName = asString(away.team?.displayName);
  if (!homeName || !awayName) return null;

  const type = comp.status?.type ?? {};
  const completed = type.completed === true;
  const detail = asString(type.detail);

  // Outcome ONLY for completed matches; trust the winner flag (covers penalties).
  let outcome: Outcome | null = null;
  if (completed) {
    if (home.winner === true) outcome = "home";
    else if (away.winner === true) outcome = "away";
    else outcome = "draw";
  }

  return {
    dateUtc,
    homeName,
    awayName,
    homeAbbr: asString(home.team?.abbreviation),
    awayAbbr: asString(away.team?.abbreviation),
    completed,
    outcome,
    detail,
    seasonSlug: asString(ev.season?.slug),
  };
}

/**
 * Parse a raw ESPN scoreboard JSON document into normalized results. Pure +
 * defensive: any bad event is skipped, never throws. Exported so tests can feed
 * captured fixtures without touching the network.
 */
export function parseEspnScoreboard(json: unknown): EspnResult[] {
  if (!json || typeof json !== "object") return [];
  const events = (json as EspnScoreboard).events;
  if (!Array.isArray(events)) return [];
  const out: EspnResult[] = [];
  for (const ev of events) {
    const r = toEspnResult(ev);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Fetch + normalize ESPN's scoreboard for one UTC match-day.
 *
 * @param dateYyyymmdd e.g. "20260611".
 * @returns the day's normalized results, or NULL on ANY network/HTTP/parse
 *   problem so the caller falls back. Never throws.
 */
export async function fetchEspnResultsForDate(
  dateYyyymmdd: string,
): Promise<EspnResult[] | null> {
  if (!/^\d{8}$/.test(dateYyyymmdd)) return null;
  try {
    const res = await fetch(`${SCOREBOARD_URL}?dates=${dateYyyymmdd}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseEspnScoreboard(json);
  } catch {
    return null;
  }
}

/**
 * The ESPN `dates=YYYYMMDD` buckets to query for a match at `kickoffIso`.
 *
 * ESPN files games by US-EASTERN calendar day, NOT UTC. A 03:00 UTC kickoff is
 * ~23:00 ET the night before, so ESPN serves it under the PREVIOUS day's bucket.
 * Querying only the match's own UTC day therefore silently misses every late/
 * early-UTC kickoff (this stranded real Group results for days). We return the
 * UTC day plus BOTH neighbours so the event is in one of the buckets regardless
 * of the offset. This is safe: the matcher still pins the exact game by
 * (UTC-day == UTC-day) AND team-name, so an unrelated neighbour-day event can
 * never be mis-assigned — extra buckets only ever ADD the chance of a find.
 */
export function espnDateBuckets(kickoffIso: string): string[] {
  const ms = new Date(kickoffIso).getTime();
  return [-1, 0, 1].map((offsetDays) =>
    new Date(ms + offsetDays * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, ""),
  );
}

// ===========================================================================
// MATCHER — map an ESPN event to one of OUR seeded matches.
//
// Strategy: kickoff UTC DAY + normalized team-name set (order-insensitive).
// Group-stage teams are real, so they name-match after normalization. The
// alias map handles known ESPN-vs-schedule spelling gaps, VERIFIED against real
// ESPN responses where noted.
//
// KNOCKOUT: our seeded KO teams are bracket PLACEHOLDERS ("W101", "1A") until
// the bracket fills, so they CANNOT name-match a real ESPN event. We skip KO
// auto-mapping for now — the organizer override covers KO results. See the
// KO TODO below for the hook to enable it once KO teams are filled.
// ===========================================================================

/**
 * Known ESPN-name -> schedule-name aliases (compared post-normalization, so all
 * lowercase, accent-free). Both spellings are normalized to a single canonical
 * token so either side matches regardless of which the source uses.
 *
 * VERIFIED against real ESPN WC2026 / WC2022 responses:
 *   - ESPN "Czechia"      vs schedule "Czech Republic"  (2026-06-11 KOR-CZE)
 *   - ESPN "South Korea"  == schedule "South Korea"     (already aligned)
 * UNVERIFIED but defensively included (likely future ESPN/openfootball gaps):
 *   - "Korea Republic" / "South Korea"
 *   - "USA" / "United States"
 *   - "Turkey" / "Türkiye"  (Turkiye after accent-strip)
 *   - "Curacao" / "Curaçao" (Curacao after accent-strip)
 *   - "Ivory Coast" / "Cote d'Ivoire"
 *   - "Bosnia and Herzegovina" / "Bosnia-Herzegovina"
 */
const NAME_ALIASES: Record<string, string> = {
  // Czechia <-> Czech Republic
  czechia: "czech-republic",
  "czech-republic": "czech-republic",
  // Korea
  "korea-republic": "south-korea",
  "republic-of-korea": "south-korea",
  korea: "south-korea",
  "south-korea": "south-korea",
  // USA
  usa: "united-states",
  us: "united-states",
  "united-states-of-america": "united-states",
  "united-states": "united-states",
  // Türkiye (accent-stripped to "turkiye")
  turkey: "turkiye",
  turkiye: "turkiye",
  // Curaçao (accent-stripped to "curacao")
  curacao: "curacao",
  // Côte d'Ivoire — "Côte d'Ivoire" accent-strips to "cote-d-ivoire" (note the
  // standalone "d"), so map BOTH that and the no-apostrophe form to one token.
  "ivory-coast": "cote-divoire",
  "cote-d-ivoire": "cote-divoire",
  "cote-divoire": "cote-divoire",
  // Bosnia
  "bosnia-and-herzegovina": "bosnia-herzegovina",
  "bosnia-herzegovina": "bosnia-herzegovina",
  // DR Congo — VERIFIED 2026-06-08: ESPN serves "Congo DR", our schedule
  // (openfootball) "DR Congo". Without this alias, Group K results for them
  // would never auto-match. Both normalize to "dr-congo".
  "congo-dr": "dr-congo",
  "dr-congo": "dr-congo",
};

/**
 * Normalize a team name to a comparison token: lowercase, accent-stripped,
 * non-alphanumerics collapsed to '-', then mapped through the alias table.
 */
export function normalizeTeamName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (ü -> u, ç -> c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return NAME_ALIASES[base] ?? base;
}

/** Unordered pair key from two team names (so home/away orientation is ignored). */
function pairKey(a: string, b: string): string {
  return [normalizeTeamName(a), normalizeTeamName(b)].sort().join("|");
}

/** UTC calendar day (YYYY-MM-DD) of an ISO timestamp. */
function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** True for a seeded match whose teams are bracket placeholders, not real teams. */
function isKnockoutPlaceholder(match: Match): boolean {
  // Group matches always have real teams. KO seed teams look like "W73","1A","L101".
  return match.stage !== "group";
}

/**
 * Map a single ESPN result to a seeded match id, or null if no confident match.
 * Matches on (UTC day == UTC day) AND (unordered normalized team-name pair).
 * Skips knockout placeholder fixtures (their team labels can't name-match).
 */
export function matchEspnToSeed(
  espn: EspnResult,
  matches: Match[],
): string | null {
  const espnDay = utcDay(espn.dateUtc);
  const espnPair = pairKey(espn.homeName, espn.awayName);
  for (const m of matches) {
    if (isKnockoutPlaceholder(m)) continue; // TODO(KO): drop this once KO teams fill — see below.
    if (utcDay(m.kickoff) !== espnDay) continue;
    if (pairKey(m.home, m.away) === espnPair) return m.id;
  }
  return null;
  // TODO(KO): when knockout fixtures get real team names (bracket fills), remove
  // the isKnockoutPlaceholder skip so KO results auto-ingest too. The date+pair
  // matcher already works for any stage; only the placeholder guard blocks it.
}

/** A completed ESPN result resolved to one of our matches. */
export interface MatchedEspnResult {
  matchId: string;
  outcome: Outcome;
}

/**
 * Resolve a day's ESPN results to (matchId, outcome) pairs for our seeded
 * matches. Only COMPLETED results with a confident match are returned, so the
 * sync can record them directly as authoritative feed results.
 */
export function matchEspnResults(
  results: EspnResult[],
  matches: Match[],
): MatchedEspnResult[] {
  const out: MatchedEspnResult[] = [];
  for (const r of results) {
    if (!r.completed || r.outcome === null) continue;
    const matchId = matchEspnToSeed(r, matches);
    if (matchId) out.push({ matchId, outcome: r.outcome });
  }
  return out;
}

// ===========================================================================
// KO TEAM RESOLUTION — fill a knockout fixture's PLACEHOLDER teams from the feed.
//
// Our seeded KO matches carry bracket placeholders ("W101","1A") until the
// earlier rounds finish. Once a round resolves, ESPN/openfootball publish the
// real teams for the next round's events BEFORE they kick off. We can't match by
// team name (ours are placeholders), so the heuristic is structural:
//
//   match an ESPN event to one of OUR KO matches when
//     (1) ESPN round (season.slug) maps to the SAME stage, AND
//     (2) the kickoff is on the SAME UTC calendar DAY, AND
//     (3) it is the SAME ORDER within that (day, stage) — both lists sorted by
//         kickoff time, so the i-th ESPN event fills the i-th seeded slot.
//
// The bracket calendar (which slots play which day) is fixed and published, so
// (day, stage, order) is a stable, defensible key that both sources agree on.
// We only resolve when ESPN gives TWO REAL team names (neither a placeholder),
// and only overwrite a still-placeholder seeded slot — so it is idempotent and
// never clobbers an already-resolved or organizer-corrected fixture. The
// organizer override remains the backstop for any slot the feed mis-aligns.
// ===========================================================================

/** ESPN season.slug -> our Stage. Unknown slugs map to null (skip). */
const ESPN_SLUG_TO_STAGE: Record<string, Stage> = {
  "group-stage": "group",
  "round-of-32": "r32",
  "round-of-16": "r16",
  quarterfinals: "qf",
  "quarter-finals": "qf",
  semifinals: "sf",
  "semi-finals": "sf",
  "third-place": "sf", // consolation, same tier as the semis in our model
  final: "final",
};

/** Map an ESPN season slug to our Stage, or null if unrecognised. */
export function espnSlugToStage(slug: string | null): Stage | null {
  if (!slug) return null;
  return ESPN_SLUG_TO_STAGE[slug.toLowerCase()] ?? null;
}

/** A KO fixture's placeholder teams resolved to the real qualified teams. */
export interface ResolvedKoTeams {
  matchId: string;
  home: string;
  away: string;
}

/** A feed event normalized for the structural KO matcher (source-agnostic). */
export interface KoFeedEvent {
  stage: Stage;
  /** ISO-8601 UTC kickoff. */
  kickoff: string;
  home: string;
  away: string;
}

/**
 * Source-agnostic structural matcher: line our still-placeholder KO slots up
 * against real-team feed events by (UTC day, stage, order-within-day). Both
 * sides are bucketed by (day, stage) and kickoff-sorted, then the i-th seed slot
 * takes the i-th feed event's teams. Only emits when the feed event has TWO real
 * teams. Pure + defensive: skips anything ambiguous, never throws.
 */
export function resolveKoTeamsByStructure(
  events: KoFeedEvent[],
  koMatches: Match[],
): ResolvedKoTeams[] {
  // Match each REAL-team feed event to the seeded slot with the SAME stage and
  // the SAME kickoff (to the minute). Both our schedule and ESPN carry the
  // published FIFA fixture times, so kickoff is a STABLE, UNIQUE key per KO slot.
  //
  // Why not index-within-day (the old approach)? As the bracket fills one slot
  // at a time across days, a resolved slot leaves the "unresolved" list but its
  // team-pair stays in the feed — so the i-th feed event no longer lines up with
  // the i-th remaining slot, and an ALREADY-USED pair gets written onto the next
  // still-empty slot. That produced duplicate fixtures (e.g. Brazil v Japan in
  // two R32 slots). Keying on kickoff makes a pair resolvable to exactly one slot
  // regardless of resolution order, so it can never duplicate.
  const eventByKey = new Map<string, KoFeedEvent>();
  for (const e of events) {
    if (e.stage === "group") continue;
    if (isPlaceholderTeam(e.home) || isPlaceholderTeam(e.away)) continue;
    const key = `${e.stage}|${koKickoffKey(e.kickoff)}`;
    if (!eventByKey.has(key)) eventByKey.set(key, e);
  }

  const out: ResolvedKoTeams[] = [];
  for (const m of koMatches) {
    if (m.stage === "group") continue;
    const e = eventByKey.get(`${m.stage}|${koKickoffKey(m.kickoff)}`);
    if (e) out.push({ matchId: m.id, home: e.home, away: e.away });
  }
  return out;
}

/** Kickoff bucket key: UTC to the minute ("YYYY-MM-DDTHH:MM"). Both sources use
 *  the published FIFA times, so this aligns exactly and is unique per KO slot. */
function koKickoffKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

/**
 * Resolve real teams for our still-placeholder KO matches from a day's ESPN
 * events, via the structural (day, stage, order) matcher. ESPN's round comes
 * from season.slug.
 *
 * @param results all ESPN events for the relevant day(s)
 * @param koMatches OUR knockout matches that still hold placeholders
 */
export function matchEspnKoTeams(
  results: EspnResult[],
  koMatches: Match[],
): ResolvedKoTeams[] {
  const events: KoFeedEvent[] = [];
  for (const r of results) {
    const stage = espnSlugToStage(r.seasonSlug);
    if (!stage) continue;
    // REJECT any candidate whose home/away is NOT a real team. Before the bracket
    // fills, ESPN serves POSITION DESCRIPTORS ("Group A 2nd Place", "Group C
    // Winner", "Third Place Group A/B/C/D/F") as the team labels — these are NOT
    // teams. We must never write a descriptor over a placeholder slot (it would
    // look like a real opponent AND block later resolution to the real team). So
    // we only forward an event when BOTH sides pass isPlaceholderTeam === false;
    // resolveKoTeamsByStructure re-checks defensively. Pre-tournament this drops
    // every KO event, so we resolve NOTHING until real teams actually qualify.
    if (isPlaceholderTeam(r.homeName) || isPlaceholderTeam(r.awayName)) continue;
    events.push({ stage, kickoff: r.dateUtc, home: r.homeName, away: r.awayName });
  }
  return resolveKoTeamsByStructure(events, koMatches);
}
