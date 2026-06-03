// ============================================================================
// Feed store — suggestions + sync heartbeat.
//
// WHY THIS EXISTS: the shared DataStore contract (lib/data.ts) models only
// CONFIRMED results (Result), and `setResult` always stamps source "organizer".
// It has no place for an UNconfirmed feed SUGGESTION, nor a "last sync" time.
// The brief needs both: the organizer screen shows the API suggestion per match
// plus a sync heartbeat. Rather than modify the frozen shared file, suggestions
// + heartbeat live here, server-side and in-memory.
//
// HONESTY / LIMITS: this is per-process memory — it resets on restart and is
// NOT shared across serverless instances. That is fine: a feed suggestion is a
// disposable HINT, never the source of truth. Losing it just means the
// organizer reads the match off the TV instead of one-tapping a pre-fill. The
// source of truth is always the organizer's confirmation in the DataStore.
// (Integration note: a persistent feed_source table would be the durable home;
// see app/actions/organizer.ts header + the README data-model section.)
//
// Server-only.
// ============================================================================

import "server-only";
import type { Outcome } from "../types";

/** A pre-filled suggestion for one match, from the results feed. */
export interface FeedSuggestion {
  matchId: string;
  outcome: Outcome;
  /** Always "feed" — these are never authoritative. */
  source: "feed";
  /** ISO-8601 of when this suggestion was last written by a sync. */
  updatedAt: string;
}

/** Module-level singletons. `globalThis` guards against dev hot-reload resets. */
interface FeedState {
  suggestions: Map<string, FeedSuggestion>;
  lastSyncAt: string | null;
  lastSyncNote: string | null;
}

const KEY = "__wm2026_feed_state__";

function state(): FeedState {
  const g = globalThis as unknown as Record<string, FeedState | undefined>;
  if (!g[KEY]) {
    g[KEY] = { suggestions: new Map(), lastSyncAt: null, lastSyncNote: null };
  }
  return g[KEY]!;
}

/** Store/overwrite a feed suggestion for a match. */
export function setSuggestion(matchId: string, outcome: Outcome): FeedSuggestion {
  const suggestion: FeedSuggestion = {
    matchId,
    outcome,
    source: "feed",
    updatedAt: new Date().toISOString(),
  };
  state().suggestions.set(matchId, suggestion);
  return suggestion;
}

/** Bulk-store suggestions; returns the count written. */
export function setSuggestions(
  entries: Array<{ matchId: string; outcome: Outcome }>,
): number {
  for (const e of entries) setSuggestion(e.matchId, e.outcome);
  return entries.length;
}

/** Read one suggestion, or null. */
export function getSuggestion(matchId: string): FeedSuggestion | null {
  return state().suggestions.get(matchId) ?? null;
}

/** Read all current suggestions keyed by matchId. */
export function getSuggestions(): Record<string, FeedSuggestion> {
  return Object.fromEntries(state().suggestions);
}

/** Record a successful (or attempted) sync as the heartbeat. */
export function markSync(note?: string): string {
  const now = new Date().toISOString();
  state().lastSyncAt = now;
  state().lastSyncNote = note ?? null;
  return now;
}

export interface SyncHeartbeat {
  /** ISO-8601 of the last sync attempt, or null if never run this process. */
  lastSyncAt: string | null;
  lastSyncNote: string | null;
  suggestionCount: number;
}

/** Read the heartbeat for the organizer UI. */
export function getHeartbeat(): SyncHeartbeat {
  const s = state();
  return {
    lastSyncAt: s.lastSyncAt,
    lastSyncNote: s.lastSyncNote,
    suggestionCount: s.suggestions.size,
  };
}
