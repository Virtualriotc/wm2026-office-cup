// ============================================================================
// Auth — server-only. There is NO password.
//
// Identity is a private, human-readable CODE in the format MP-XXXX-XXXX-XXXX.
// We store ONLY a SHA-256 hash of it (`tokenHash`); the plaintext is shown to
// the user exactly once at join time. The hash is what lands in the DB and in
// the httpOnly session cookie's lookup path. Organizer access is gated by a
// separate ORGANIZER_CODE (env) or the user's `isOrganizer` flag.
//
// Everything authoritative happens server-side: this module must never be
// imported into a client component.
// ============================================================================

import "server-only";
import { cookies } from "next/headers";
import { webcrypto } from "node:crypto";

const SESSION_COOKIE = "mp_session";
/** Marks a browser that has unlocked the organizer surface with ORGANIZER_CODE. */
const ORGANIZER_COOKIE = "mp_org";
const CODE_PREFIX = "MP";
/** Characters used in codes: no ambiguous 0/O/1/I/L for readability. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_GROUPS = 3;
const CODE_GROUP_LEN = 4;

/**
 * Generate a fresh access code, e.g. "MP-7K2A-9QF4-MNP3".
 * Uses crypto-strong randomness; rejection-samples to avoid modulo bias.
 */
export function generateCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    let group = "";
    while (group.length < CODE_GROUP_LEN) {
      const buf = new Uint8Array(1);
      webcrypto.getRandomValues(buf);
      const v = buf[0]!;
      // Reject the tail that would bias the modulo, then map into the alphabet.
      const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
      if (v >= limit) continue;
      group += CODE_ALPHABET[v % CODE_ALPHABET.length];
    }
    groups.push(group);
  }
  return `${CODE_PREFIX}-${groups.join("-")}`;
}

/** True if a string is shaped like a valid code (cheap pre-check). */
export function isValidCodeFormat(code: string): boolean {
  const re = new RegExp(
    `^${CODE_PREFIX}-[${CODE_ALPHABET}]{${CODE_GROUP_LEN}}(?:-[${CODE_ALPHABET}]{${CODE_GROUP_LEN}}){${CODE_GROUPS - 1}}$`,
  );
  return re.test(code.trim().toUpperCase());
}

/** Normalize user input before hashing/lookup (trim + uppercase). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** SHA-256 hash of a code, hex-encoded. The only form we persist. */
export async function hashToken(code: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeCode(code));
  const digest = await webcrypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time compare of two strings of equal expected length. Returns false
 * fast on a length mismatch (a length difference is not secret), otherwise
 * XOR-accumulates every char so the time taken does not depend on WHERE the
 * first differing byte is. Use for any secret/token equality check.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Constant-time-ish compare of a code against a stored hash. */
export async function verifyToken(
  code: string,
  storedHash: string,
): Promise<boolean> {
  const computed = await hashToken(code);
  return constantTimeEqual(computed, storedHash);
}

/**
 * Create a session: set an httpOnly cookie holding the token hash. We store
 * the hash (not the plaintext code) so a leaked cookie can't be read back into
 * a shareable code, and the value matches the `users.tokenHash` lookup column.
 */
export async function createSession(tokenHash: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, tokenHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 120, // ~120 days; data is cleared after the final
  });
}

/** Read the current session token hash, or null if not signed in. */
export async function getSession(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Clear the session cookie. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user from the session cookie, or null.
 * Imported lazily to avoid a hard dependency cycle (data store -> auth).
 */
export async function getCurrentUser() {
  const tokenHash = await getSession();
  if (!tokenHash) return null;
  const { getStore } = await import("./data");
  return getStore().getUserByToken(tokenHash);
}

/** Throw-style guard for server actions / route handlers that need a user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** True if the supplied code matches the configured ORGANIZER_CODE. */
export function organizerCodeMatches(code: string): boolean {
  const expected = process.env.ORGANIZER_CODE;
  if (!expected) return false;
  // constantTimeEqual returns false fast on a length mismatch (length is not
  // secret) and otherwise compares without leaking WHERE the first byte differs.
  return constantTimeEqual(normalizeCode(code), normalizeCode(expected));
}

/**
 * Mark this browser as an organizer by setting an httpOnly cookie that holds
 * the HASH of ORGANIZER_CODE — never the code itself. The code is validated
 * server-side here; it must never travel in a URL or live in a client prop.
 */
export async function createOrganizerSession(): Promise<void> {
  const expected = process.env.ORGANIZER_CODE;
  if (!expected) return;
  const jar = await cookies();
  jar.set(ORGANIZER_COOKIE, await hashToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // a week; organizers re-unlock cheaply
  });
}

/** Clear the organizer cookie. */
export async function clearOrganizerSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ORGANIZER_COOKIE);
}

/** True if this browser holds a valid organizer cookie for the current code. */
async function hasOrganizerCookie(): Promise<boolean> {
  const expected = process.env.ORGANIZER_CODE;
  if (!expected) return false;
  const jar = await cookies();
  const cookie = jar.get(ORGANIZER_COOKIE)?.value;
  if (!cookie) return false;
  // Constant-time compare so the organizer session hash can't be recovered
  // byte-by-byte via a response-timing oracle (matches verifyToken/unlock).
  return constantTimeEqual(cookie, await hashToken(expected));
}

/**
 * Validate an organizer code and, on success, set the organizer cookie. Returns
 * true if the code matched. The plaintext code is consumed here and never
 * leaves the server. Use this from the unlock server action.
 */
export async function unlockOrganizerWithCode(code: string): Promise<boolean> {
  if (!organizerCodeMatches(code)) return false;
  await createOrganizerSession();
  return true;
}

/**
 * Organizer guard. Grants access when EITHER:
 *  - the signed-in user has the `isOrganizer` flag, OR
 *  - this browser holds a valid organizer cookie (set via unlockOrganizerWithCode).
 *
 * The optional `organizerCode` arg is accepted for direct server-to-server
 * calls only; it is NOT how the UI authenticates (the UI sets a cookie so the
 * code never appears in a URL, log, or client prop).
 * In the mock store a default organizer exists so /organizer is demoable.
 */
export async function requireOrganizer(organizerCode?: string) {
  const user = await getCurrentUser();
  if (user?.isOrganizer) return user;

  if (await hasOrganizerCookie()) {
    return user; // may be null: cookie-only organizer access
  }
  if (organizerCode && organizerCodeMatches(organizerCode)) {
    return user; // may be null: code-only organizer access
  }
  throw new Error("FORBIDDEN");
}
