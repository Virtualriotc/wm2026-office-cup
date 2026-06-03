"use server";

// ============================================================================
// Organizer server actions — an OPTIONAL OVERRIDE on top of auto-ingestion.
//
// Results now arrive AUTOMATICALLY from the feed (see lib/ingest/sync), stored
// as source "feed" — that is the source of truth. `confirmResult(matchId,
// outcome)` is NO LONGER a required step. It writes via DataStore.setResult,
// which stamps source "organizer" and thus OVERRIDES the feed value (see
// lib/scoring.resolveResult for the precedence). Use it only to correct a wrong
// or missing feed call. Confirming triggers an idempotent recompute (the mock
// derives leaderboards from (predictions, results) on read; the Neon store
// rebuilds the derived tables in one transaction). Re-confirming the same match
// is safe and never double-counts.
//
// AUTH: every action is gated by requireOrganizer (lib/auth). A non-organizer
// gets FORBIDDEN. Everything here runs server-side only.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Outcome } from "@/lib/types";
import { getStore } from "@/lib/data";
import { requireOrganizer, unlockOrganizerWithCode } from "@/lib/auth";
import { seedFixtures } from "@/lib/ingest/openfootball";
import { runSync } from "@/lib/ingest/sync";

const VALID_OUTCOMES: ReadonlySet<string> = new Set<Outcome>([
  "home",
  "draw",
  "away",
]);

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Unlock the organizer surface with a code. The code is POSTed to the server in
 * this action body (never a URL/query param), validated against ORGANIZER_CODE,
 * and on success an httpOnly organizer cookie is set. The plaintext never leaves
 * the server and is not echoed back. On success the caller revalidates the page.
 */
export async function unlockOrganizer(code: string): Promise<ActionResult> {
  if (typeof code !== "string" || code.trim().length === 0) {
    return { ok: false, error: "FORBIDDEN" };
  }
  const ok = await unlockOrganizerWithCode(code);
  if (!ok) return { ok: false, error: "FORBIDDEN" };
  revalidatePath("/organizer");
  return { ok: true };
}

/**
 * Override a match winner. Optional — results auto-ingest from the feed; this
 * only corrects a wrong/missing feed call. Stamps source "organizer" (which
 * always wins over the feed), triggers an idempotent recompute, and revalidates
 * the surfaces that show results.
 *
 * @param organizerCode optional code for code-only organizer access when the
 *   signed-in user isn't flagged isOrganizer (see lib/auth.requireOrganizer).
 */
export async function confirmResult(
  matchId: string,
  outcome: Outcome,
  organizerCode?: string,
): Promise<ActionResult> {
  try {
    await requireOrganizer(organizerCode);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  if (typeof matchId !== "string" || matchId.length === 0) {
    return { ok: false, error: "Missing match." };
  }
  if (!VALID_OUTCOMES.has(outcome)) {
    return { ok: false, error: "Invalid outcome." };
  }

  const store = getStore();
  try {
    // setResult stamps source "organizer" (overrides feed) and, in the mock,
    // makes the match final. The recompute is implicit: getLeaderboard /
    // getDepartmentStandings recompute from raw data on read, so a single
    // setResult is the whole authoritative write.
    await store.setResult(matchId, outcome);
    // Warm + verify the recompute is consistent (cheap, idempotent).
    await store.getLeaderboard();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, error: reason };
  }

  // Refresh every surface that reflects results.
  revalidatePath("/organizer");
  revalidatePath("/scoreboard");
  revalidatePath("/predict");
  return { ok: true, message: "Result confirmed. Tables updating." };
}

/**
 * Seed fixtures/bracket/kickoffs ONCE from openfootball (graceful fallback to
 * the bundled set). Idempotent — safe to tap more than once.
 */
export async function seedFixturesAction(
  organizerCode?: string,
): Promise<ActionResult> {
  try {
    await requireOrganizer(organizerCode);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  try {
    const result = await seedFixtures();
    revalidatePath("/organizer");
    revalidatePath("/predict");
    const src =
      result.source === "openfootball"
        ? "openfootball (live)"
        : "bundled fallback";
    return {
      ok: true,
      message: `Seeded ${result.fixtureCount} fixtures from ${src}.${
        result.warning ? ` (${result.warning})` : ""
      }`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, error: reason };
  }
}

/**
 * Manually trigger a feed sync (same work the cron does): auto-ingest results
 * for any due match (now >= kickoff + buffer) from API-Football (primary) or
 * openfootball (fallback), store as source "feed", recompute, and update the
 * heartbeat. Degrades gracefully with no key / over-limit. Never overrides an
 * organizer call.
 */
export async function syncNowAction(
  organizerCode?: string,
): Promise<ActionResult> {
  try {
    await requireOrganizer(organizerCode);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const result = await runSync();
  revalidatePath("/organizer");
  return {
    ok: true,
    message: result.note,
  };
}
