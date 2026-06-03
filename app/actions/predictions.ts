"use server";

// ============================================================================
// Server Action: save a user's matchday picks.
//
// This is the ONLY write path the PREDICT screen uses. Two guarantees live
// here, both server-side and un-bypassable by the client:
//
//   1. AUTH: the picks are attributed to the signed-in user (session cookie),
//      never to a user id supplied by the browser.
//   2. LOCK: `getStore().savePredictions` REJECTS any pick whose match has
//      reached kickoff (now >= match.kickoff). The store is the authoritative
//      gate; this action does not trust the UI's idea of what is open. We
//      surface anything the store rejected so the screen can refresh those
//      matches to their read-only locked state.
//
// One pick per match is enforced by the store's upsert on (userId, matchId)
// (UNIQUE(user_id, match_id)); we additionally de-dupe the incoming payload so
// a buggy client can't send two picks for the same match.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getStore, type SavePredictionInput } from "@/lib/data";

/** Outcome literals accepted from the client. Knockouts only send home/away. */
const pickSchema = z.object({
  matchId: z.string().min(1),
  pick: z.enum(["home", "draw", "away"]),
});

const payloadSchema = z.array(pickSchema).max(200);

export interface SavePicksState {
  ok: boolean;
  /** How many picks were stored. */
  saved: number;
  /** Match ids the server rejected because they had already locked. */
  rejectedLocked: string[];
  /** Stable error key for the UI (maps to COPY.errors / COPY.predict). */
  error?: "unauthenticated" | "invalid" | "generic";
}

/**
 * Persist a batch of picks for the signed-in user.
 *
 * Returns a typed result rather than throwing (except for auth) so the client
 * can render success / partial-lock / error states from COPY without parsing
 * exception messages.
 */
export async function savePredictions(
  picks: SavePredictionInput[],
): Promise<SavePicksState> {
  // --- auth: identity comes from the session, not the payload ---
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    return { ok: false, saved: 0, rejectedLocked: [], error: "unauthenticated" };
  }

  // --- validate + de-dupe (keep the last pick per match) ---
  const parsed = payloadSchema.safeParse(picks);
  if (!parsed.success) {
    return { ok: false, saved: 0, rejectedLocked: [], error: "invalid" };
  }
  const byMatch = new Map<string, SavePredictionInput>();
  for (const p of parsed.data) byMatch.set(p.matchId, p);
  const deduped = [...byMatch.values()];

  if (deduped.length === 0) {
    return { ok: true, saved: 0, rejectedLocked: [] };
  }

  // --- write: the store re-checks the lock per match (server-side truth) ---
  try {
    const { saved, rejectedLocked } = await getStore().savePredictions(
      userId,
      deduped,
    );
    // Picks went public the moment they saved and the board changes on lock;
    // refresh the screen so locked matches flip to read-only with results.
    revalidatePath("/predict");
    return { ok: true, saved, rejectedLocked };
  } catch {
    return { ok: false, saved: 0, rejectedLocked: [], error: "generic" };
  }
}
