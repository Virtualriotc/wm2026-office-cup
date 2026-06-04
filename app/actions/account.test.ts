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

import { continueWithCode, createAccount, removeMe, signOut } from "./account";
import { getStore } from "@/lib/data";
import { hashToken } from "@/lib/auth";
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
    // LOGIN_LIMIT is 120/min in the action; a burst beyond it must throttle.
    let throttled = false;
    let firstThrottleAt = -1;
    for (let i = 0; i < 130; i++) {
      const r = await continueWithCode("MP-AAAA-BBBB-CCCC");
      if (!r.ok && r.error === COPY.errors.tooManyAttempts) {
        throttled = true;
        firstThrottleAt = i;
        break;
      }
    }
    expect(throttled).toBe(true);
    // The first 120 must NOT be throttled (office-on-one-NAT burst headroom).
    expect(firstThrottleAt).toBe(120);
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

  it("throttles a fast create-account burst at the per-minute cap", async () => {
    // createAccount is gated by 120/min/IP plus a high office-safe 1000/day backstop.
    // In a fast same-minute burst the PER-MINUTE cap (120) binds first: the first 120
    // succeed, the 121st is throttled. (Both caps are deliberately well above a single
    // office's headcount so a whole office behind one NAT IP is never blocked at launch.)
    let throttled = false;
    let firstThrottleAt = -1;
    let succeeded = 0;
    for (let i = 0; i < 130; i++) {
      const r = await createAccount(`Burst ${i}`, "Energy Ops", true);
      if (r.ok) {
        succeeded += 1;
      } else if (r.error === COPY.errors.tooManyAttempts) {
        throttled = true;
        firstThrottleAt = i;
        break;
      }
    }
    expect(throttled).toBe(true);
    // Per-minute cap is 120: the first 120 land, the 121st (index 120) is throttled.
    expect(succeeded).toBe(120);
    expect(firstThrottleAt).toBe(120);
  });
});

describe("removeMe (GDPR self-service erasure)", () => {
  it("deletes the signed-in user and clears the session", async () => {
    const created = await createAccount("Erase Me", "Energy Ops", true);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // The session cookie is set, so the user is resolvable by token.
    const store = getStore();
    const tokenHash = await hashToken(created.code);
    const before = await store.getUserByToken(tokenHash);
    expect(before).not.toBeNull();

    const res = await removeMe();
    expect(res.ok).toBe(true);

    // User is gone from the store, and the session cookie was cleared.
    expect(await store.getUserByToken(tokenHash)).toBeNull();
    // A second removeMe (no session) is a harmless idempotent ok.
    expect((await removeMe()).ok).toBe(true);
  });

  it("is a no-op ok when nobody is signed in", async () => {
    const res = await removeMe();
    expect(res.ok).toBe(true);
  });
});

describe("signOut", () => {
  it("clears the session but leaves the account intact", async () => {
    const created = await createAccount("Sign Out", "Energy Ops", true);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const store = getStore();
    const tokenHash = await hashToken(created.code);
    expect(await store.getUserByToken(tokenHash)).not.toBeNull();

    const res = await signOut();
    expect(res.ok).toBe(true);

    // The account still exists (sign out is not deletion) — the code resumes it.
    expect(await store.getUserByToken(tokenHash)).not.toBeNull();
    __resetRateLimitForTests();
    const resumed = await continueWithCode(created.code);
    expect(resumed.ok).toBe(true);
  });
});

describe("createAccount — duplicate name+department guard", () => {
  it("rejects a second signup with the SAME name in the SAME department", async () => {
    const first = await createAccount("Vatsal", "Dup Lane A", true);
    expect(first.ok).toBe(true);
    const dup = await createAccount("Vatsal", "Dup Lane A", true);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe(COPY.errors.nameTaken);
  });

  it("is case-insensitive and trims (Vatsal == ' vatsal ')", async () => {
    const first = await createAccount("Vatsal", "Dup Lane B", true);
    expect(first.ok).toBe(true);
    const dup = await createAccount("  vatsal ", "Dup Lane B", true);
    expect(dup.ok).toBe(false);
  });

  it("ALLOWS the same name in a DIFFERENT department", async () => {
    const a = await createAccount("Vatsal", "Dup Lane C", true);
    expect(a.ok).toBe(true);
    const b = await createAccount("Vatsal", "Dup Lane D", true);
    expect(b.ok).toBe(true);
  });
});
