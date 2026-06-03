// ============================================================================
// Rate limit — unit tests for the per-IP fixed-window throttle that guards the
// public login + create-account server actions (lib/rateLimit.ts).
//
// We assert the behaviour the security audit asked for: a single IP is capped
// per window, independent IPs and independent buckets don't share a budget, the
// window RESETS after it elapses, and a missing IP fails OPEN into a shared
// "unknown" bucket (never a hard lock-out of real users). clientIpFrom reads the
// proxy headers Vercel sets.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  rateLimit,
  clientIpFrom,
  __resetRateLimitForTests,
} from "./rateLimit";

beforeEach(() => __resetRateLimitForTests());
afterEach(() => vi.useRealTimers());

describe("rateLimit — per-IP fixed window", () => {
  it("allows up to the limit, then denies inside the same window", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("login", ip, 5, 60_000).ok).toBe(true);
    }
    // The 6th hit in the window is denied.
    const denied = rateLimit("login", ip, 5, 60_000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("keeps separate budgets per IP", () => {
    for (let i = 0; i < 5; i++) rateLimit("login", "10.0.0.1", 5, 60_000);
    // A different IP is unaffected and still within budget.
    expect(rateLimit("login", "10.0.0.2", 5, 60_000).ok).toBe(true);
  });

  it("keeps separate budgets per bucket (login vs create-account)", () => {
    const ip = "9.9.9.9";
    for (let i = 0; i < 5; i++) rateLimit("login", ip, 5, 60_000);
    expect(rateLimit("login", ip, 5, 60_000).ok).toBe(false);
    // The create-account bucket for the same IP is independent and fresh.
    expect(rateLimit("create-account", ip, 5, 60_000).ok).toBe(true);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));
    const ip = "5.5.5.5";
    for (let i = 0; i < 3; i++) rateLimit("login", ip, 3, 60_000);
    expect(rateLimit("login", ip, 3, 60_000).ok).toBe(false);

    // Advance past the window: the next hit starts a fresh window.
    vi.setSystemTime(new Date("2026-06-03T12:01:01Z"));
    expect(rateLimit("login", ip, 3, 60_000).ok).toBe(true);
  });

  it("fails open into a shared 'unknown' bucket when the IP is empty", () => {
    // An empty IP must not lock out every caller individually, but the calls do
    // share ONE budget so the path is still bounded.
    expect(rateLimit("login", "", 2, 60_000).ok).toBe(true);
    expect(rateLimit("login", "", 2, 60_000).ok).toBe(true);
    expect(rateLimit("login", "", 2, 60_000).ok).toBe(false); // shared budget exhausted
  });
});

describe("clientIpFrom — proxy header parsing", () => {
  it("takes the left-most x-forwarded-for entry (the originating client)", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIpFrom(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no x-forwarded-for", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.22" });
    expect(clientIpFrom(h)).toBe("198.51.100.22");
  });

  it("returns '' when no client-IP header is present", () => {
    expect(clientIpFrom(new Headers())).toBe("");
  });
});
