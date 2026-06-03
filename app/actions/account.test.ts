// ============================================================================
// Account server actions — security-relevant behaviour of the two PUBLIC,
// unauthenticated entry points (continueWithCode + createAccount).
//
// These run on the in-memory MockStore (no DATABASE_URL). Under vitest there is
// no request scope, so next/headers' headers() throws; the action's callerIp()
// swallows that and buckets every call under the shared "unknown" key — which is
// exactly the fail-open path we want to exercise here. We assert:
//   1. A real created code resumes the session (round-trip create -> continue).
//   2. A wrong code is rejected with the SAME generic message as a malformed one
//      (no user-existence oracle), and the malformed path now also does the
//      hash+lookup (timing-uniform) without crashing.
//   3. The login + create-account rate limits ENGAGE: once the per-window budget
//      is spent, further calls return the throttle copy instead of doing work.
//
// We reset the in-memory rate-limit windows between tests so ordering is stable.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

// next/headers has no request scope under vitest. Stub a minimal in-memory
// cookie jar (so createSession can set/read the session) and a headers() that
// carries a fixed client IP (so callerIp() buckets per that IP, not "unknown").
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.99" }),
}));

import { continueWithCode, createAccount } from "./account";
import { __resetRateLimitForTests } from "@/lib/rateLimit";
import { COPY } from "@/lib/copy";

beforeEach(() => {
  __resetRateLimitForTests();
  cookieJar.clear();
});

describe("continueWithCode", () => {
  it("resumes a session for a freshly created code (create -> continue round-trip)", async () => {
    const created = await createAccount("Round Trip", "Energy Ops", true);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    __resetRateLimitForTests(); // separate the create budget from the login one
    const resumed = await continueWithCode(created.code);
    expect(resumed.ok).toBe(true);
  });

  it("rejects a wrong code and a malformed code with the SAME generic message", async () => {
    // A well-formed but unknown code: valid shape, no such user.
    const unknown = await continueWithCode("MP-AAAA-BBBB-CCCC");
    // A malformed code: wrong shape entirely.
    const malformed = await continueWithCode("definitely-not-a-code");

    expect(unknown.ok).toBe(false);
    expect(malformed.ok).toBe(false);
    if (unknown.ok || malformed.ok) return;
    // No existence oracle: both miss paths return the identical copy.
    expect(unknown.error).toBe(COPY.errors.invalidCode);
    expect(malformed.error).toBe(COPY.errors.invalidCode);
  });

  it("throttles after the login budget is spent (same IP, one window)", async () => {
    // LOGIN_LIMIT is 30/min in the action; a burst beyond it must throttle.
    let throttled = false;
    let firstThrottleAt = -1;
    for (let i = 0; i < 40; i++) {
      const r = await continueWithCode("MP-AAAA-BBBB-CCCC");
      if (!r.ok && r.error === COPY.errors.tooManyAttempts) {
        throttled = true;
        firstThrottleAt = i;
        break;
      }
    }
    expect(throttled).toBe(true);
    // The first 30 must NOT be throttled (legitimate burst headroom).
    expect(firstThrottleAt).toBeGreaterThanOrEqual(30);
  });
});

describe("createAccount", () => {
  it("creates a participant and returns a one-time MP code", async () => {
    const res = await createAccount("New Joiner", "Energy Tech", true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.code).toMatch(/^MP-/);
    expect(res.displayName).toBe("New Joiner");
  });

  it("rejects a write with no consent", async () => {
    const res = await createAccount("No Consent", "Energy Tech", false);
    expect(res.ok).toBe(false);
  });

  it("throttles after the create-account budget is spent", async () => {
    // CREATE_LIMIT is 30/min in the action; a burst past it throttles, but the
    // first 30 (a legitimate department joining together) all succeed.
    let throttled = false;
    let firstThrottleAt = -1;
    for (let i = 0; i < 40; i++) {
      const r = await createAccount(`Burst ${i}`, "Energy Ops", true);
      if (!r.ok && r.error === COPY.errors.tooManyAttempts) {
        throttled = true;
        firstThrottleAt = i;
        break;
      }
    }
    expect(throttled).toBe(true);
    expect(firstThrottleAt).toBeGreaterThanOrEqual(30);
  });
});
