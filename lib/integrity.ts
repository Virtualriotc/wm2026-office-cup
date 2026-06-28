// ============================================================================
// Daily integrity self-check — the DETECTION half of "we don't want to
// intervene". Pure function over the raw rows; the store gathers the data and
// the cron runs it after each sync, stamps the result on the organizer
// dashboard, and (if wired) alarms over Telegram. It would have caught BOTH
// historical bugs automatically: the duplicate-KO-fixtures corruption (check 1)
// and the sync day-bucket lag that stranded results (checks 3 + 5).
// ============================================================================

import type { Match } from "./types";
import { isPlaceholderTeam } from "./seed";

export type IntegritySeverity = "alarm" | "warn" | "info";

export interface IntegrityIssue {
  check: string;
  severity: IntegritySeverity;
  count: number;
  detail: string;
}

export interface IntegrityReport {
  /** true when NO `alarm`-severity issue is present (warns/infos don't fail). */
  ok: boolean;
  issues: IntegrityIssue[];
  checkedAt: string;
}

interface IntegrityInput {
  matches: Match[];
  predictions: { userId: string; matchId: string; pick: string }[];
  results: { matchId: string }[];
  now: Date;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pairKey = (m: Pick<Match, "stage" | "home" | "away">) =>
  `${m.stage}|${[norm(m.home), norm(m.away)].sort().join("|")}`;

/** Run every integrity check over the current data. Pure + deterministic. */
export function computeIntegrity(input: IntegrityInput): IntegrityReport {
  const { matches, predictions, results, now } = input;
  const nowMs = now.getTime();
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const resultSet = new Set(results.map((r) => r.matchId));
  const issues: IntegrityIssue[] = [];

  // 1. ALARM — duplicate knockout fixtures (the same matchup in >1 slot).
  const koByPair = new Map<string, string[]>();
  for (const m of matches) {
    if (m.stage === "group") continue;
    const k = pairKey(m);
    (koByPair.get(k) ?? koByPair.set(k, []).get(k)!).push(m.id);
  }
  const dupFixtures = [...koByPair.values()].filter((ids) => ids.length > 1);
  if (dupFixtures.length) {
    issues.push({ check: "duplicate_ko_fixtures", severity: "alarm", count: dupFixtures.length, detail: `${dupFixtures.length} knockout matchup(s) exist in more than one slot` });
  }

  // 2. ALARM — a placeholder/descriptor persisted as a real team on a LOCKED slot.
  const leaks = matches.filter(
    (m) => m.stage !== "group" && new Date(m.kickoff).getTime() < nowMs && (isPlaceholderTeam(m.home) || isPlaceholderTeam(m.away)),
  );
  if (leaks.length) {
    issues.push({ check: "placeholder_leak", severity: "alarm", count: leaks.length, detail: `${leaks.length} locked knockout slot(s) still show a placeholder team` });
  }

  // 3. ALARM — a user predicted the SAME real matchup twice (duplicate-scatter proof).
  const userMatchupCount = new Map<string, number>();
  for (const p of predictions) {
    const m = matchById.get(p.matchId);
    if (!m || m.stage === "group") continue;
    const k = `${p.userId}|${pairKey(m)}`;
    userMatchupCount.set(k, (userMatchupCount.get(k) ?? 0) + 1);
  }
  const doublePicks = [...userMatchupCount.values()].filter((c) => c > 1).length;
  if (doublePicks) {
    issues.push({ check: "double_picks", severity: "alarm", count: doublePicks, detail: `${doublePicks} case(s) of one user predicting the same matchup twice` });
  }

  // 4. WARN — kicked off, has picks, but no result (catches the sync-lag class).
  const predicted = new Set(predictions.map((p) => p.matchId));
  const stuck = matches.filter(
    (m) => new Date(m.kickoff).getTime() < nowMs - 90 * 60_000 && predicted.has(m.id) && !resultSet.has(m.id),
  );
  if (stuck.length) {
    issues.push({ check: "locked_no_result", severity: "warn", count: stuck.length, detail: `${stuck.length} match(es) kicked off >90min ago with picks but no result` });
  }

  // 5. WARN — a group match well past the result buffer with no result (feed/alias gap).
  const ingestGap = matches.filter(
    (m) => m.stage === "group" && new Date(m.kickoff).getTime() < nowMs - 3 * 3_600_000 && !resultSet.has(m.id),
  );
  if (ingestGap.length) {
    issues.push({ check: "ingest_gap", severity: "warn", count: ingestGap.length, detail: `${ingestGap.length} group match(es) past the result buffer with no result` });
  }

  // 6. INFO — fixture-count drift from the expected 104-match 2026 schedule.
  if (matches.length !== 104) {
    issues.push({ check: "fixture_count", severity: "info", count: matches.length, detail: `${matches.length} fixtures (expected 104)` });
  }

  return { ok: !issues.some((i) => i.severity === "alarm"), issues, checkedAt: now.toISOString() };
}

/** One-line human summary for the organizer dashboard / Telegram. */
export function summariseIntegrity(report: IntegrityReport): string {
  if (report.issues.length === 0) return "Integrity ✓ — all checks clean.";
  const parts = report.issues.map((i) => `${i.severity === "alarm" ? "❌" : i.severity === "warn" ? "⚠" : "ℹ"} ${i.check} (${i.count})`);
  return `${report.ok ? "Integrity warnings" : "INTEGRITY ALARM"}: ${parts.join(", ")}`;
}
