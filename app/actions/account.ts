"use server";

// ============================================================================
// Account server actions — the JOIN / CODE flow's only server entry points.
//
// Everything authoritative happens here, server-side:
//   - createAccount(name, dept): creates the user via the data store (which
//     generates the MP-code + stores only its hash), opens a session by setting
//     the httpOnly cookie, and returns the PLAINTEXT code ONCE for the UI to
//     show. The code is never returned again.
//   - continueWithCode(code): validates + hashes the pasted code, looks the
//     user up by token hash, and opens a session. Never reveals whether a code
//     "exists" beyond the generic invalid-code message.
//
// These are imported by the client landing components and run on the server.
// ============================================================================

import { headers } from "next/headers";
import { z } from "zod";
import { getStore, DEPARTMENTS } from "@/lib/data";
import {
  createSession,
  clearSession,
  hashToken,
  isValidCodeFormat,
  normalizeCode,
  requireUser,
} from "@/lib/auth";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";
import { COPY } from "@/lib/copy";

// Per-IP fixed-window budgets for the two PUBLIC, unauthenticated actions.
// Independent buckets so a burst of bad logins can't starve genuine sign-ups.
//
// SIZING: these blunt a SCRIPTED flood (hundreds–thousands of calls/sec) while
// never tripping a legitimate burst. The real worst case is the WHOLE office
// behind ONE NAT IP hitting "join" within the same minute the launch email
// lands — up to ~100+ calls in 60s. 120/min/IP clears a big office in one
// instance, yet still caps an abuser to ~2 req/s (far below a DoS) and the
// high-entropy code makes account spam pointless (organizer can delete fakes).
// Per-process (see lib/rateLimit.ts): the effective ceiling across N Vercel
// instances is N×120 — generous for a launch, still a brake against a script.
const RATE_WINDOW_MS = 60_000; // one minute
const LOGIN_LIMIT = 120; // continueWithCode: 120 paste-attempts/min/IP (office on one NAT returning at once)
const CREATE_LIMIT = 120; // createAccount: 120 new rows/min/IP (whole office joining at launch)

// SYBIL BRAKE (soft): on top of the per-minute burst budget, a DAILY ceiling on
// new accounts per IP. Real Sybil resistance is impossible without real auth —
// this only brakes a mass-signup script behind one IP (an office NAT still clears
// it: a whole department joining is tens, not hundreds). Fakes that slip through
// can be erased by the organizer via deleteUser.
const CREATE_DAILY_LIMIT = 1000; // createAccount: 1000/day/IP — office-safe (a whole 200+ person office on ONE NAT IP, plus retries, over a day); a high backstop against a runaway script, not a real Sybil defense (the organizer can delete fakes via removeMe/deleteUser)
const CREATE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // one day

/** Best-effort client IP for this request, from the proxy headers. */
async function callerIp(): Promise<string> {
  try {
    return clientIpFrom(await headers());
  } catch {
    return ""; // headers() unavailable (shouldn't happen in an action) -> "unknown" bucket
  }
}

/** Result of a create-account attempt. On success the session is already set. */
export type CreateAccountResult =
  | { ok: true; code: string; displayName: string }
  | { ok: false; error: string };

/** Result of a continue-with-code attempt. On success the session is set. */
export type ContinueWithCodeResult =
  | { ok: true }
  | { ok: false; error: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, COPY.errors.generic)
  .max(40, COPY.errors.generic);

/** A typed brand-new department name: non-empty, trimmed, capped at 40 chars. */
const newDepartmentSchema = z
  .string()
  .trim()
  .min(1, COPY.errors.departmentInvalid)
  .max(40, COPY.errors.departmentInvalid);

/**
 * Create a new participant.
 *
 * Validates the name + department + consent server-side (never trusts the
 * client gate), creates the user, opens a session, and returns the one-time
 * plaintext code. Consent is required: a write without it is rejected.
 *
 * `department` is the combobox value: EITHER an existing department id (the
 * player picked a known lane) OR a brand-new free-text name (the player typed
 * their own). For an existing id we hand it straight to the store; for a new
 * name we validate length first, then let the store create-or-reuse it by
 * normalized slug (so dupes by name collapse to the same lane, never doubled).
 */
export async function createAccount(
  displayName: string,
  department: string,
  consent: boolean,
): Promise<CreateAccountResult> {
  try {
    // Throttle BEFORE any write so a flood can't spam user/department rows.
    const ip = await callerIp();
    const limited = rateLimit(
      "create-account",
      ip,
      CREATE_LIMIT,
      RATE_WINDOW_MS,
    );
    if (!limited.ok) {
      return { ok: false, error: COPY.errors.tooManyAttempts };
    }
    // Sybil brake: a stricter DAILY ceiling per IP on top of the per-minute one.
    const dailyLimited = rateLimit(
      "create-account-daily",
      ip,
      CREATE_DAILY_LIMIT,
      CREATE_DAILY_WINDOW_MS,
    );
    if (!dailyLimited.ok) {
      return { ok: false, error: COPY.errors.tooManyAttempts };
    }

    if (!consent) {
      return { ok: false, error: COPY.errors.generic };
    }

    const parsedName = nameSchema.safeParse(displayName);
    if (!parsedName.success) {
      return { ok: false, error: COPY.errors.generic };
    }
    const name = parsedName.data;

    const store = getStore();
    const departments = await store.getDepartments();
    const knownDeptIds = new Set(
      (departments.length ? departments : DEPARTMENTS).map((d) => d.id),
    );

    // Resolve the department: a known id passes through; anything else is a
    // typed new lane and must clear the new-department validation.
    let department_: string;
    if (knownDeptIds.has(department)) {
      department_ = department;
    } else {
      const parsedDept = newDepartmentSchema.safeParse(department);
      if (!parsedDept.success) {
        return { ok: false, error: COPY.errors.departmentInvalid };
      }
      department_ = parsedDept.data;
    }

    // Resolve the department to a concrete lane (creating it if it's a typed-new
    // one — the store dedups by normalized slug, so two players typing the same
    // lane land in ONE department, not two).
    const dept = await store.getOrCreateDepartmentByName(department_);
    // Reject a duplicate NAME within that SAME department: login is by the secret
    // code (never the name), so a dup name is not a security risk — but two
    // identical entries on the board are confusing, so we ask the second person
    // to vary it (add a surname/initial).
    if (await store.nameTakenInDepartment(name, dept.id)) {
      return { ok: false, error: COPY.errors.nameTaken };
    }
    const { user, code } = await store.createUser(name, dept.id);
    // Open the session immediately so "Got it — start picking" lands signed in.
    await createSession(user.tokenHash);

    return { ok: true, code, displayName: user.displayName };
  } catch {
    return { ok: false, error: COPY.errors.generic };
  }
}

/**
 * Resume with a saved code. Validates the format, hashes it, and looks up the
 * user by token hash. On a match, opens the session. Any miss returns the same
 * generic invalid-code message (no user-existence oracle).
 */
export async function continueWithCode(
  code: string,
): Promise<ContinueWithCodeResult> {
  try {
    // Throttle BEFORE the hash + lookup so a flood can't spin SHA-256 + DB reads.
    const limited = rateLimit(
      "login",
      await callerIp(),
      LOGIN_LIMIT,
      RATE_WINDOW_MS,
    );
    if (!limited.ok) {
      return { ok: false, error: COPY.errors.tooManyAttempts };
    }

    // Always compute the hash AND do the lookup, even for a malformed code, so
    // the timing of a format-valid miss and a format-invalid input is uniform
    // (no timing distinction between the two miss paths). `formatOk` only
    // changes the final boolean, not the work done.
    const normalized = normalizeCode(code);
    const formatOk = isValidCodeFormat(normalized);
    const tokenHash = await hashToken(normalized);
    const store = getStore();
    const user = await store.getUserByToken(tokenHash);
    if (!formatOk || !user) {
      return { ok: false, error: COPY.errors.invalidCode };
    }

    await createSession(user.tokenHash);
    return { ok: true };
  } catch {
    return { ok: false, error: COPY.errors.generic };
  }
}

/** Result of a self-service data-removal request. */
export type RemoveMeResult = { ok: boolean };

/**
 * GDPR right-to-erasure, self-service. Hard-deletes the signed-in user and
 * everything tied to them (predictions, leaderboard row) via the store, then
 * clears the session so the browser is signed out. The leaderboards + consensus
 * recompute from raw rows on the next read, so the player fully disappears.
 *
 * Returns { ok: true } even if the session was already gone (idempotent — the
 * user wanted to be removed either way; there's nothing to leak).
 */
export async function removeMe(): Promise<RemoveMeResult> {
  try {
    const user = await requireUser();
    await getStore().deleteUser(user.id);
    await clearSession();
    return { ok: true };
  } catch {
    // No session / already removed: clear the cookie defensively and report ok.
    await clearSession();
    return { ok: true };
  }
}

/** Sign out: clear the session cookie. The account/picks data is untouched. */
export async function signOut(): Promise<{ ok: boolean }> {
  await clearSession();
  return { ok: true };
}
