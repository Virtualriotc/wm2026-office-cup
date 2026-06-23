// ============================================================================
// Pure view-model helpers for the PREDICT screen. No I/O, no React — safe to
// import from the server page and from client components alike.
// ============================================================================

import type { Match, Stage } from "@/lib/types";
import { STAGE_POINTS } from "@/lib/scoring";

/** Knockout stages have no draw: the pick is "which team advances". */
export function isKnockout(stage: Stage): boolean {
  return stage !== "group";
}

/** Points a correct pick is worth at this stage (drives the per-card badge). */
export function pointsForStage(stage: Stage): number {
  return STAGE_POINTS[stage];
}

const STAGE_LABEL: Record<Stage, string> = {
  group: "Group stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  final: "Final",
};

/** Human label for a stage, e.g. "Quarter-final". */
export function stageLabel(stage: Stage): string {
  return STAGE_LABEL[stage];
}

/**
 * True when an 'sf'-tier match is actually the third-place play-off, not a
 * semi-final. Both share the 'sf' stage (same points), so we tell them apart by
 * the seeded fixture id ("…match-for-third-place…"). Used only for the label.
 */
export function isThirdPlace(match: Pick<Match, "id" | "stage">): boolean {
  return match.stage === "sf" && /third-place/i.test(match.id);
}

/** The ribbon styling for a knockout card: round name + its accent colour.
 *  Returns null for group-stage matches, which keep their existing royal tag. */
export interface RoundStyle {
  /** Round name shown on the ribbon, e.g. "Quarter-final" / "Third place". */
  label: string;
  /** Ribbon background (a CSS colour or gradient). */
  bg: string;
  /** Foreground colour that meets contrast on `bg`. */
  fg: string;
  /** The Final gets a gold drop-shadow on the whole card. */
  gold: boolean;
}

const ROUND_ACCENT: Record<
  Exclude<Stage, "group">,
  { bg: string; fg: string }
> = {
  r32: { bg: "var(--color-royal)", fg: "#fff" },
  r16: { bg: "var(--color-teal)", fg: "#fff" },
  qf: { bg: "var(--color-violet)", fg: "#fff" },
  sf: { bg: "var(--color-coral)", fg: "var(--color-ink)" },
  final: {
    bg: "linear-gradient(100deg, var(--color-gold), #ffe07a 55%, var(--color-gold))",
    fg: "var(--color-ink)",
  },
};

export function roundStyle(match: Pick<Match, "id" | "stage">): RoundStyle | null {
  if (match.stage === "group") return null;
  if (isThirdPlace(match)) {
    return { label: "Third place", bg: "var(--color-bronze)", fg: "var(--color-ink)", gold: false };
  }
  const accent = ROUND_ACCENT[match.stage];
  return { label: stageLabel(match.stage), bg: accent.bg, fg: accent.fg, gold: match.stage === "final" };
}

/**
 * Derive a stable, human "Matchday N" number for a given calendar day.
 *
 * The data model has no matchday column, so we number the DISTINCT match days
 * across the whole fixture list in kickoff order: the first day with any match
 * is Matchday 1, the next distinct day is Matchday 2, and so on. This is
 * deterministic and stable as long as the fixture set is stable.
 *
 * @param allMatches every fixture (any order)
 * @param dayKey the YYYY-MM-DD of the matchday we're numbering
 * @returns 1-based matchday index, or 0 if the day isn't found
 */
export function matchdayNumber(allMatches: Match[], dayKey: string): number {
  const days = [
    ...new Set(allMatches.map((m) => m.kickoff.slice(0, 10))),
  ].sort();
  const idx = days.indexOf(dayKey);
  return idx === -1 ? 0 : idx + 1;
}

/** YYYY-MM-DD of a match's kickoff (the calendar day it belongs to). */
export function dayKeyOf(match: Match): string {
  return match.kickoff.slice(0, 10);
}

/** One day's pickable slate: its date, derived matchday number, and matches. */
export interface MatchdayGroup {
  /** YYYY-MM-DD of the day. */
  dayKey: string;
  /** Stable "Matchday N" index across the whole fixture list. */
  matchdayNo: number;
  /** The day's matches, kickoff-sorted. */
  matches: Match[];
}

/**
 * Group a flat, kickoff-sorted list of matches into per-calendar-day sections,
 * each tagged with its stable "Matchday N" number (numbered across the WHOLE
 * fixture list, so the label is consistent no matter which subset is shown).
 * Returns groups in ascending day order — the soonest first.
 *
 * @param matches the slate to group (already kickoff-sorted)
 * @param allMatches every fixture, only used to derive stable matchday numbers
 */
export function groupByMatchday(
  matches: Match[],
  allMatches: Match[],
): MatchdayGroup[] {
  const byDay = new Map<string, Match[]>();
  for (const m of matches) {
    const key = dayKeyOf(m);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(m);
    else byDay.set(key, [m]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayMatches]) => ({
      dayKey,
      matchdayNo: matchdayNumber(allMatches, dayKey),
      matches: dayMatches,
    }));
}
