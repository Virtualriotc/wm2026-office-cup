// ============================================================================
// Organizer auth + actions — security-relevant behaviour.
//
//   1. organizerCodeMatches: the RIGHT code matches, a WRONG code (including a
//      same-length and a different-length one) does NOT — proving the
//      constantTimeEqual swap is behaviourally correct (length-safe, no throw).
//   2. unlockOrganizer round-trips: a correct code sets the cookie so a
//      subsequent requireOrganizer passes; a wrong code is FORBIDDEN.
//   3. lockOrganizer clears the cookie (requireOrganizer then FORBIDDEN).
//   4. The unlock action throttles after 5 attempts / IP / window.
//
// next/headers has no request scope under vitest, so we stub a minimal cookie
// jar + a headers() carrying a fixed client IP (so the rate limiter buckets per
// that IP, not the shared "unknown" one).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }),
}));

// next/cache revalidatePath is a no-op outside a request.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ORG_CODE = "MP-ABCD-EFGH-JKLM";
process.env.ORGANIZER_CODE = ORG_CODE;

import { organizerCodeMatches, requireOrganizer } from "@/lib/auth";
import { unlockOrganizer, lockOrganizer } from "./organizer";
import { __resetRateLimitForTests } from "@/lib/rateLimit";

beforeEach(() => {
  __resetRateLimitForTests();
  cookieJar.clear();
});

describe("organizerCodeMatches (constant-time, length-safe)", () => {
  it("matches the configured code (case/space-insensitive via normalize)", () => {
    expect(organizerCodeMatches(ORG_CODE)).toBe(true);
    expect(organizerCodeMatches(`  ${ORG_CODE.toLowerCase()}  `)).toBe(true);
  });

  it("rejects a wrong code of the SAME length without throwing", () => {
    // Same length as ORG_CODE, every char different where it counts.
    const wrongSameLen = "MP-ZZZZ-ZZZZ-ZZZZ";
    expect(wrongSameLen.length).toBe(ORG_CODE.length);
    expect(organizerCodeMatches(wrongSameLen)).toBe(false);
  });

  it("rejects a wrong code of a DIFFERENT length (no leak, no throw)", () => {
    expect(organizerCodeMatches("MP-AB")).toBe(false);
    expect(organizerCodeMatches(`${ORG_CODE}-EXTRA`)).toBe(false);
    expect(organizerCodeMatches("")).toBe(false);
  });
});

describe("unlockOrganizer / lockOrganizer round-trip", () => {
  it("a correct code unlocks (cookie set -> requireOrganizer passes)", async () => {
    const res = await unlockOrganizer(ORG_CODE);
    expect(res.ok).toBe(true);
    // The organizer cookie now satisfies the server-side guard.
    await expect(requireOrganizer()).resolves.toBeDefined();
  });

  it("a wrong code is FORBIDDEN and sets no cookie", async () => {
    const res = await unlockOrganizer("MP-ZZZZ-ZZZZ-ZZZZ");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("FORBIDDEN");
    await expect(requireOrganizer()).rejects.toThrow();
  });

  it("lockOrganizer clears the cookie (requireOrganizer then FORBIDDEN)", async () => {
    await unlockOrganizer(ORG_CODE);
    await expect(requireOrganizer()).resolves.toBeDefined();
    await lockOrganizer();
    await expect(requireOrganizer()).rejects.toThrow();
  });
});

describe("unlockOrganizer rate limit (brute-force brake)", () => {
  it("throttles after 5 attempts in one window (same IP)", async () => {
    // ORG_UNLOCK_LIMIT is 5/min. Wrong codes return FORBIDDEN whether throttled
    // or not (the throttle leaks nothing), so we assert via the BOUNDARY: a
    // correct code presented AFTER the budget is spent is still refused.
    for (let i = 0; i < 5; i++) {
      const r = await unlockOrganizer("MP-ZZZZ-ZZZZ-ZZZZ");
      expect(r.ok).toBe(false);
    }
    // 6th call is over budget: even the CORRECT code can't unlock now.
    const overBudget = await unlockOrganizer(ORG_CODE);
    expect(overBudget.ok).toBe(false);
    // And no cookie was set, so the guard still refuses.
    await expect(requireOrganizer()).rejects.toThrow();
  });
});
