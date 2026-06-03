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
  hashToken,
  isValidCodeFormat,
  normalizeCode,
} from "@/lib/auth";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";
import { COPY } from "@/lib/copy";

// Per-IP fixed-window budgets for the two PUBLIC, unauthenticated actions.
// Independent buckets so a burst of bad logins can't starve genuine sign-ups.
//
// SIZING: these blunt a SCRIPTED flood (which does hundreds–thousands of calls
// per second) while never tripping a legitimate burst. The real worst case is a
// whole department behind ONE office NAT IP joining at kickoff — tens of calls
// over a few minutes. 30/min/IP clears that comfortably yet still caps an abuser
// to ~0.5 req/s, far below what a DoS needs. Per-process (see lib/rateLimit.ts),
// so the effective ceiling across N Vercel instances is N×30 — still tiny vs a
// flood, and the high-entropy code keeps brute force infeasible regardless.
const RATE_WINDOW_MS = 60_000; // one minute
const LOGIN_LIMIT = 30; // continueWithCode: 30 paste-attempts/min/IP
const CREATE_LIMIT = 30; // createAccount: 30 new rows/min/IP

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
    const limited = rateLimit(
      "create-account",
      await callerIp(),
      CREATE_LIMIT,
      RATE_WINDOW_MS,
    );
    if (!limited.ok) {
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

    // The store dedups a new name by normalized slug (getOrCreateDepartmentByName),
    // so two players typing the same lane land in one department, not two.
    const { user, code } = await store.createUser(name, department_);
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
