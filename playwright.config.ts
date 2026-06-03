import { defineConfig, devices } from "@playwright/test";

// ============================================================================
// Playwright E2E + a11y config for "Match Picks 2026" / WM 2026 Office Cup.
//
// Runs the app on the in-memory MOCK store (DATABASE_URL unset) with SEED_DEMO=1
// so the populated mid-tournament snapshot is loaded. We start the dev server on
// a fixed port, with the organizer + cron env vars set so the organizer-unlock
// and cron-protection paths are exercisable.
//
// SEED_DEMO=1 is TEST-ONLY: the e2e specs assert the rich UI (locked matches, a
// non-zero race, the overtake, the demo "you"). The PRODUCTION default (no
// SEED_DEMO) runs on the real, empty schedule — nothing locked at 2026-06-02.
//
// The mock store is per-PROCESS, seeded once at boot, so all browser contexts
// share the same seeded snapshot (the demo "you", finished group games, etc.).
// Tests are written to tolerate that shared, append-only state.
// ============================================================================

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// A valid organizer code in the MP-XXXX-XXXX-XXXX shape (auth.isValidCodeFormat
// is not enforced for the organizer code, but we keep it well-formed anyway).
export const ORGANIZER_CODE = "MP-ORGZ-TEST-CODE";
export const CRON_SECRET = "test-cron-secret-please-change";

export default defineConfig({
  testDir: "./e2e",
  // The LIVE specs (live.spec.ts, zzcheck.live.spec.ts) run ONLY against the
  // deployed Neon-backed site via playwright.live.config.ts (which scopes itself
  // with testMatch). They assert the real prod shape and would fail against this
  // local SEED_DEMO mock-store server, so this default config must NOT pick them
  // up. Exclude both the bare `live.spec.ts` and any `*.live.spec.ts`.
  testIgnore: ["**/live.spec.ts", "**/*.live.spec.ts"],
  // The mock store is shared per server process; serialize to keep the seeded
  // snapshot and any created users predictable across specs.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  // Generous timeouts absorb `next dev`'s one-time on-demand compilation of a
  // route or a server action on its first hit (the warm-up in global-setup
  // covers page renders; the first server-action POST still compiles lazily).
  timeout: 45_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Honour reduced-motion so the long race/overtake animations settle fast
    // and don't flake the a11y/assertion timing. We test the no-reduced-motion
    // overtake explicitly in the scoreboard spec where it matters.
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Dev mode (not `npm run start`) on purpose: the session/organizer cookies
    // set `secure: true` only when NODE_ENV === "production", and a Secure
    // cookie is dropped by the browser over plain http://127.0.0.1 — so a
    // production server over http can never hold a session, breaking every
    // auth-gated flow under test. Dev runs the SAME store, server actions, and
    // server-side lock with NODE_ENV unset, so cookies work over http and the
    // signed-in paths are genuinely exercised. The production BUILD is verified
    // separately (npm run build) in the QA run.
    command: `next dev -p ${PORT}`,
    url: BASE_URL,
    // Always start a fresh server (never reuse a warm one): the mock store is
    // per-process in-memory and accumulates created users / unlocked cookies
    // across a run, so each `playwright test` invocation must boot clean to be
    // deterministic and independently reproducible.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      // Force the mock store (zero-setup) regardless of any local .env.
      DATABASE_URL: "",
      // Seed the populated mid-tournament DEMO snapshot (faked-past kickoffs,
      // results, ~12 demo colleagues, a staged overtake) so the e2e specs can
      // validate the rich UI: locked matches, a non-zero race, the mover badge,
      // and the demo "you". The PRODUCTION default (no SEED_DEMO) stays on the
      // real, empty schedule — nothing locked at the 2026-06-02 clock.
      SEED_DEMO: "1",
      ORGANIZER_CODE,
      CRON_SECRET,
    },
  },
});
