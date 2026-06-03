import { defineConfig, devices } from "@playwright/test";

// ============================================================================
// LIVE config — runs e2e/live.spec.ts against the DEPLOYED, Neon-backed site at
// https://wm2026-office-cup.vercel.app. There is NO webServer here: we drive the
// real production deployment over HTTPS, so the session cookie is Secure (it is
// set only when NODE_ENV === "production") and rides fine over https. This is
// the functional + PERSISTENCE proof: accounts and picks must survive a fresh,
// cookie-less browser.newContext(), which can only work if they live in Neon.
//
// Scope is restricted to live.spec.ts via testMatch: the mock-store specs
// (landing/predict/scoreboard/…) assert SEED_DEMO data (locked games, a
// non-zero race, a demo "you") that does NOT exist on the real, pre-tournament
// schedule, so they must not run against prod.
// ============================================================================

const BASE_URL = "https://wm2026-office-cup.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)live\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry: hydration of a freshly served route can intermittently reset a
  // controlled form (documented in helpers.ts); a retry rides it out. No
  // assertion is relaxed — every attempt must pass the same gates.
  retries: 1,
  reporter: [["list"]],
  // Generous ceilings: a real round-trip to Vercel + Neon (cold lambda, DB
  // write) is slower than the local mock store, and two full form flows plus a
  // network save fit comfortably under this.
  timeout: 90_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
