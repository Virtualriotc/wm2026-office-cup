// ============================================================================
// Relative-leaderboard framing — PURE, no I/O.
//
// goal.md §5: the leaderboard is RELATIVE, never absolute. We never render
// "you are #47 of 50" (the documented pool-killer). Instead we frame position
// as: top 3 + the players directly above/below you + your percentile +
// climb-delta + a single "catchable" hook to the player just ahead.
//
// This module turns the raw LeaderboardRow[] (already ranked by scoring.ts)
// into exactly that shape for one viewer. It is the only place the relative
// framing rules live, so the UI component stays dumb.
// ============================================================================

import type { LeaderboardRow, Department } from "@/lib/types";

/** A row decorated for display: initials + department color, plus the "you" flag. */
export interface DisplayRow extends LeaderboardRow {
  /** 2-letter initials for the badge, e.g. "GM". */
  initials: string;
  /** Department badge color. */
  color: string;
  /** Department short name for the meta line. */
  departmentName: string;
  isYou: boolean;
}

export interface RelativeView {
  /** True when we have a "you" to anchor the relative framing on. */
  hasViewer: boolean;
  /** The viewer's own decorated row (null if no viewer / not on board). */
  you: DisplayRow | null;
  /** Top of the cup — up to 3 rows, the leaders everyone chases. */
  top: DisplayRow[];
  /** Within reach — the rows immediately above + below the viewer. */
  neighbours: DisplayRow[];
  /**
   * The player one rank ahead of the viewer, and the gap, for the
   * "{points} behind {name}. Catchable." hook. Null if the viewer leads.
   */
  chase: { name: string; pointsBehind: number } | null;
  /** Total players, used only for percentile phrasing (never "#N of M"). */
  total: number;
}

/**
 * Pick a legible text colour (near-black ink or white) for text drawn ON a
 * solid background `hex`, by its relative luminance. Department colours are
 * arbitrary (seed + user-created), so a fixed `text-white` fails WCAG contrast
 * on light lanes (e.g. yellow). This keeps the initials/abbr badges readable on
 * any background. Falls back to ink for malformed input.
 */
export function readableTextOn(hex: string): "#14130f" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#14130f";
  const n = parseInt(m[1]!, 16);
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin((n >> 16) & 0xff);
  const g = toLin((n >> 8) & 0xff);
  const b = toLin(n & 0xff);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Pick whichever of white / near-black ink gives the HIGHER contrast on this
  // background. (ink luminance ≈ 0.006.) Best-of-two maximises legibility on
  // arbitrary department colours, including mid-tones where neither is perfect.
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastInk = (lum + 0.05) / (0.006 + 0.05);
  return contrastWhite >= contrastInk ? "#ffffff" : "#14130f";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Build the relative view for `viewerId` (may be null for a not-signed-in
 * visitor — then we just show the top of the cup, no "you" framing).
 *
 * `neighbourRadius` is how many rows above/below the viewer to include.
 */
export function buildRelativeView(
  rows: LeaderboardRow[],
  departments: Department[],
  viewerId: string | null,
  neighbourRadius = 2,
): RelativeView {
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const decorate = (r: LeaderboardRow): DisplayRow => {
    const dept = deptById.get(r.departmentId);
    return {
      ...r,
      initials: initialsOf(r.displayName),
      color: dept?.color ?? "#9AA3B2",
      departmentName: dept?.name ?? "Other",
      isYou: viewerId !== null && r.userId === viewerId,
    };
  };

  const decorated = rows.map(decorate);
  const total = decorated.length;
  const top = decorated.slice(0, 3);

  const youIndex = decorated.findIndex((r) => r.isYou);
  if (youIndex === -1) {
    return { hasViewer: false, you: null, top, neighbours: [], chase: null, total };
  }

  const you = decorated[youIndex]!;

  // Neighbours: the band [you - radius, you + radius], excluding the viewer
  // themselves (they get their own prominent card) and de-duping anyone
  // already shown in `top`.
  const topIds = new Set(top.map((r) => r.userId));
  const start = Math.max(0, youIndex - neighbourRadius);
  const end = Math.min(decorated.length, youIndex + neighbourRadius + 1);
  const neighbours = decorated
    .slice(start, end)
    .filter((r) => !r.isYou && !topIds.has(r.userId));

  // Chase: the single player one rank ahead, for the catchable hook.
  const ahead = youIndex > 0 ? decorated[youIndex - 1]! : null;
  const chase = ahead
    ? { name: ahead.displayName, pointsBehind: Math.max(0, ahead.points - you.points) }
    : null;

  return { hasViewer: true, you, top, neighbours, chase, total };
}
