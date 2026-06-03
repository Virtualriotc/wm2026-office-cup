// ============================================================================
// Rate limit — a lightweight, per-IP fixed-window throttle for the PUBLIC,
// unauthenticated server actions (login + create-account).
//
// WHY: continueWithCode and createAccount are reachable in a tight loop by
// anyone. The 59.5-bit code makes brute force infeasible, so this is NOT a
// confidentiality fix — it is abuse/DoS hardening: cap how fast one IP can spin
// SHA-256 + DB lookups (login) or write user/department rows (create-account).
//
// SHAPE: in-memory fixed window keyed by (bucket, ip). Counters live on
// globalThis (the same guard lib/data.ts + lib/ingest/feedStore.ts use) so they
// survive Next.js's per-layer module duplication and dev hot-reload within a
// process. State is per-process: on Vercel each serverless instance throttles
// independently, which is the correct, honest v1 trade — enough to blunt a
// single-origin flood without a KV. A distributed limiter (Upstash/Redis) is the
// upgrade path if abuse crosses instances.
//
// FAIL-OPEN on a missing IP: if we cannot read a client IP we do NOT block (we
// must never lock out every real user because a header is absent); we bucket
// such calls under a shared "unknown" key so they still share one budget.
//
// Server-only.
// ============================================================================

import "server-only";

/** One IP's window: when it started (ms) and how many hits it has taken. */
interface Window {
  resetAt: number;
  count: number;
}

const KEY = "__wm2026_rate_limit__";

function buckets(): Map<string, Window> {
  const g = globalThis as unknown as Record<string, Map<string, Window> | undefined>;
  if (!g[KEY]) g[KEY] = new Map();
  return g[KEY]!;
}

export interface RateLimitResult {
  /** True if this call is within budget and may proceed. */
  ok: boolean;
  /** Seconds until the window resets (for a Retry-After style hint). */
  retryAfterSec: number;
}

/**
 * Count one attempt against a fixed window and report whether it is allowed.
 *
 * @param bucket  logical action name, e.g. "login" or "create-account", so the
 *                two actions get INDEPENDENT budgets per IP.
 * @param ip      client IP (or any stable per-caller key). Empty/unknown callers
 *                share a single "unknown" budget rather than being locked out.
 * @param limit   max attempts allowed inside one window.
 * @param windowMs  window length in milliseconds.
 *
 * The window is FIXED: the first hit starts the clock; once `limit` hits land
 * inside it, the rest are denied until `resetAt`. Stale windows are replaced
 * lazily on the next hit for that key, so the map self-prunes per active key.
 */
export function rateLimit(
  bucket: string,
  ip: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const key = `${bucket}:${ip || "unknown"}`;
  const now = Date.now();
  const map = buckets();
  const win = map.get(key);

  if (!win || now >= win.resetAt) {
    // Start (or restart) the window with this hit.
    map.set(key, { resetAt: now + windowMs, count: 1 });
    return { ok: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  win.count += 1;
  if (win.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((win.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: Math.ceil((win.resetAt - now) / 1000) };
}

/**
 * Pull a best-effort client IP from request headers. Vercel/most proxies set
 * `x-forwarded-for` (first hop is the client); `x-real-ip` is a common fallback.
 * Returns "" when neither is present (caller buckets that under "unknown").
 */
export function clientIpFrom(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    // The left-most entry is the originating client.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() ?? "";
}

/** Test-only: clear all windows so a suite can assert from a known state. */
export function __resetRateLimitForTests(): void {
  buckets().clear();
}
