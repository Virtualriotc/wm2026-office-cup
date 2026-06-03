import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Vitest config — scopes the unit/integration suite to lib/ so the Playwright
// e2e specs (which import @playwright/test and only run under Playwright) are
// not picked up here. Also aliases the Next.js-provided "server-only" marker to
// a no-op so server modules (lib/auth, lib/data) can be imported in a plain
// Node test, and "@/..." to the repo root to match tsconfig paths.
export default defineConfig({
  test: {
    // lib/ holds the bulk of the unit/integration suite; app/ now carries the
    // server-action tests (account rate-limit + login round-trip). Both are
    // plain Node tests. The Playwright e2e specs live in e2e/ and are NOT
    // matched here (they import @playwright/test and only run under Playwright).
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "server-only": resolve(__dirname, "test/server-only-stub.ts"),
      "@": resolve(__dirname, "."),
    },
  },
});
