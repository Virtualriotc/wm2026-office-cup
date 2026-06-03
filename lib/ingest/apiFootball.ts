// ============================================================================
// API-Football client — OPTIONAL results redundancy (ESPN is the primary,
// keyless source; this only runs when API_FOOTBALL_KEY is set).
//
// CHANNEL-AGNOSTIC: API-Football is reachable two ways, selected by env:
//   - api-sports.io direct (default): host 'v3.football.api-sports.io',
//     auth header 'x-apisports-key: <key>'.
//   - RapidAPI: host 'api-football-v1.p.rapidapi.com', auth headers
//     'x-rapidapi-key: <key>' + 'x-rapidapi-host: <host>'.
// Pick via API_FOOTBALL_HOST (defaults to the direct host); the right header
// set is chosen automatically from the host.
//
// On a finished fixture the response is used ONLY to PRE-FILL a suggested
// winner; this client NEVER decides a result on its own.
//
// NO-KEY GRACEFUL FALLBACK: with no API_FOOTBALL_KEY set, fromEnv() returns
// null and the sync skips this source entirely (ESPN/openfootball cover it).
//
// We also degrade gracefully on rate-limit (429), auth failure, and network
// errors: getResults() resolves to a warning, never a throw, so a sync cron run
// can't take down the app or block the organizer.
//
// Server-only.
// ============================================================================

import "server-only";
import type { Outcome } from "../types";

/** Default channel: api-sports.io direct (x-apisports-key). */
const DEFAULT_HOST = "v3.football.api-sports.io";
/** The RapidAPI channel host (x-rapidapi-key + x-rapidapi-host). */
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";
/** FIFA World Cup league id on API-Football. Season for WM 2026 is 2026. */
const WORLD_CUP_LEAGUE_ID = 1;
const SEASON = 2026;

/** A single pre-filled suggestion: which side the feed says won. */
export interface ResultSuggestion {
  /** The API-Football fixture id, as a string (maps to Match.externalRef). */
  externalRef: string;
  outcome: Outcome;
}

export interface GetResultsResult {
  suggestions: ResultSuggestion[];
  /** Set when we returned [] for a soft reason (e.g. over-limit) rather than data. */
  warning?: string;
}

/** Map an API-Football fixture object to a winner suggestion, or null. */
function toSuggestion(raw: unknown): ResultSuggestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const fixture = r.fixture as Record<string, unknown> | undefined;
  const teams = r.teams as
    | { home?: { winner?: unknown }; away?: { winner?: unknown } }
    | undefined;
  const status = (fixture?.status as Record<string, unknown> | undefined)
    ?.short;
  // Only finished matches yield a usable suggestion.
  const FINISHED = new Set(["FT", "AET", "PEN"]);
  if (typeof status !== "string" || !FINISHED.has(status)) return null;

  const id = fixture?.id;
  const externalRef = typeof id === "number" ? `af-${id}` : null;
  if (!externalRef) return null;

  const homeWon = teams?.home?.winner === true;
  const awayWon = teams?.away?.winner === true;
  // API-Football marks BOTH winner flags false/null on a draw.
  const outcome: Outcome = homeWon ? "home" : awayWon ? "away" : "draw";
  return { externalRef, outcome };
}

/**
 * Thin client over the API-Football free tier. Construct via the static
 * `fromEnv()` so the no-key path is explicit at the call site.
 */
export class APIFootballClient {
  private readonly apiKey: string;
  private readonly host: string;

  constructor(apiKey: string, host: string = DEFAULT_HOST) {
    this.apiKey = apiKey;
    this.host = host;
  }

  /**
   * Build from env. Returns null when API_FOOTBALL_KEY is absent — the caller
   * MUST handle null as the supported "feed not configured" state (ESPN is the
   * keyless primary, so this source is optional redundancy).
   *
   * API_FOOTBALL_HOST selects the channel:
   *   unset / 'v3.football.api-sports.io'  -> api-sports.io direct
   *   'api-football-v1.p.rapidapi.com'     -> RapidAPI
   */
  static fromEnv(): APIFootballClient | null {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key || key.trim().length === 0) return null;
    const host = process.env.API_FOOTBALL_HOST?.trim() || DEFAULT_HOST;
    return new APIFootballClient(key.trim(), host);
  }

  /** True when configured for the RapidAPI channel (vs api-sports.io direct). */
  private get isRapidApi(): boolean {
    return this.host === RAPIDAPI_HOST;
  }

  /** Auth headers for the active channel. */
  private authHeaders(): Record<string, string> {
    return this.isRapidApi
      ? { "x-rapidapi-key": this.apiKey, "x-rapidapi-host": this.host }
      : { "x-apisports-key": this.apiKey };
  }

  /** Fixtures endpoint URL for the active channel (RapidAPI nests under /v3). */
  private fixturesUrl(params: URLSearchParams): string {
    const path = this.isRapidApi ? "/v3/fixtures" : "/fixtures";
    return `https://${this.host}${path}?${params.toString()}`;
  }

  /**
   * Fetch finished-fixture winner suggestions for the World Cup.
   *
   * @param matchday optional round filter (e.g. "Group Stage - 1"). When
   *   omitted, asks for the whole season's fixtures (one request); the cron
   *   filters to finished ones. Kept coarse to respect the ~100 req/day budget.
   * @returns the suggestions, or `null` on ANY soft failure (rate limit, auth,
   *   network) so callers degrade gracefully. Never throws.
   */
  async getResults(matchday?: string): Promise<GetResultsResult | null> {
    const params = new URLSearchParams({
      league: String(WORLD_CUP_LEAGUE_ID),
      season: String(SEASON),
    });
    if (matchday) params.set("round", matchday);

    try {
      const res = await fetch(this.fixturesUrl(params), {
        headers: this.authHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });

      // Free-tier rate limit / over-quota: degrade, don't fail.
      if (res.status === 429) {
        return { suggestions: [], warning: "API-Football rate limit reached (429)." };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          suggestions: [],
          warning: `API-Football auth rejected (HTTP ${res.status}). Check API_FOOTBALL_KEY.`,
        };
      }
      if (!res.ok) {
        return { suggestions: [], warning: `API-Football HTTP ${res.status}.` };
      }

      const json: unknown = await res.json();
      const obj = json as { response?: unknown; errors?: unknown };

      // API-Football returns 200 with a non-empty `errors` object on quota/plan
      // problems. Treat that as a soft failure too.
      if (
        obj.errors &&
        typeof obj.errors === "object" &&
        !Array.isArray(obj.errors) &&
        Object.keys(obj.errors as object).length > 0
      ) {
        return {
          suggestions: [],
          warning: `API-Football returned errors: ${JSON.stringify(obj.errors)}`,
        };
      }

      const list = Array.isArray(obj.response) ? obj.response : [];
      const suggestions = list
        .map(toSuggestion)
        .filter((s): s is ResultSuggestion => s !== null);
      return { suggestions };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { suggestions: [], warning: `API-Football request failed: ${reason}.` };
    }
  }
}
