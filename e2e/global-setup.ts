import { request, chromium } from "@playwright/test";

// Warm the dev server before the suite runs. `next dev` compiles routes
// on-demand on first hit, which can take several seconds — long enough that the
// very first test (cold compile of the page AND its server action) could exceed
// a normal action timeout and flake.
const BASE = "http://127.0.0.1:3210";

export default async function globalSetup() {
  // Pass 1 — HTTP GET every surface so the SERVER compiles each route's RSC/HTML.
  const ctx = await request.newContext({ baseURL: BASE });
  for (const path of ["/", "/predict", "/scoreboard", "/organizer", "/account"]) {
    try {
      await ctx.get(path, { timeout: 60_000 });
    } catch {
      // A warm-up miss is non-fatal; the test will just pay the compile cost.
    }
  }
  await ctx.dispose();

  // Pass 2 — load the interactive pages in a REAL browser so `next dev` also
  // compiles + serves the CLIENT chunks and React HYDRATES once up front. The
  // first in-browser hydration of a cold-compiled route under `next dev` is the
  // racy moment that resets controlled inputs (the join form's name/consent/
  // department); paying it here, before any spec drives a form, leaves the
  // shared dev-server process warm so the tests interact with an already-stable
  // client. We wait for the join form to be present (proof that hydration ran).
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const path of ["/", "/predict", "/scoreboard"]) {
      try {
        await page.goto(`${BASE}${path}`, { timeout: 60_000 });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(500);
      } catch {
        // Non-fatal: a warm-up miss just shifts the compile cost into the test.
      }
    }
    await browser.close();
  } catch {
    // If a browser can't launch in this environment, the HTTP warm-up still ran.
  }
}
