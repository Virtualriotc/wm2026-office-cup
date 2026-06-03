import { test, expect, type Page } from "@playwright/test";
import { createAccount, continueWithCode, CODE_RE } from "./helpers";

// ============================================================================
// LIVE functional + PERSISTENCE proof against the deployed, Neon-backed site.
// Run: npx playwright test e2e/live.spec.ts -c playwright.live.config.ts
//
// The load-bearing proofs are #3 and #4: a code/picks created in one browser
// context must come back in a SEPARATE, cookie-less browser.newContext(). A
// cookie can't carry that across contexts, so success means the user and their
// picks were genuinely persisted in Neon.
//
// Today is pre-tournament (2026-06-03): nothing is locked, the scoreboard is
// empty. The spec asserts exactly that real state — it does NOT assume the
// SEED_DEMO snapshot the mock-store specs rely on.
// ============================================================================

// Stable suffix so created accounts are identifiable in prod and unique per run.
const RUN = `${Date.now()}`;
const created: string[] = []; // human-readable account labels we made in prod

/** Attach console/page-error capture; returns the collected arrays. */
function captureErrors(page: Page): { console: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  return { console: consoleErrors, pageErrors };
}

test.describe("LIVE — functional + persistence (Neon)", () => {
  // ---- 1. Landing renders -------------------------------------------------
  test("1 · landing renders hero, both join cards, unofficial/no-betting tag", async ({
    page,
  }) => {
    const errs = captureErrors(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Hero: the display headline ("WM 2026" / "OFFICE CUP").
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ hasText: /OFFICE CUP/i }),
    ).toBeVisible();

    // Both join cards.
    await expect(
      page.getByRole("heading", { name: /Grab your spot/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Welcome back/i }),
    ).toBeVisible();
    await expect(page.getByLabel("What should we call you?")).toBeVisible();
    await expect(page.getByLabel("Your code")).toBeVisible();

    // Unofficial / no-betting compliance tag.
    await expect(
      page.getByText(/UNOFFICIAL OFFICE GAME · NO BETTING/i).first(),
    ).toBeVisible();

    // This is the REAL deployment, not the mock store: no demo-mode banner.
    await expect(page.getByText(/Demo mode/i)).toHaveCount(0);

    expect(errs.pageErrors, "no uncaught page errors").toEqual([]);
  });

  // ---- 2. Create account: existing dept AND typed-new dept ----------------
  test("2 · create account with an existing department yields an MP-code", async ({
    page,
  }) => {
    const name = `QA Existing ${RUN}`;
    const code = await createAccount(page, { name });
    expect(code).toMatch(CODE_RE);
    created.push(`${name} -> ${code}`);
  });

  test("2 · create account with a TYPED-NEW department yields an MP-code", async ({
    page,
  }) => {
    const name = `QA NewDept ${RUN}`;
    const dept = `QA Dept ${RUN}`;
    const code = await createAccount(page, { name, newDepartment: dept });
    expect(code).toMatch(CODE_RE);
    created.push(`${name} (new dept "${dept}") -> ${code}`);
  });

  // ---- 3. PERSISTENCE: code resumes in a FRESH, cookie-less context -------
  test("3 · code created in one context resumes signed-in in a FRESH context (persisted in Neon)", async ({
    browser,
  }) => {
    // Context A — create the account, get the code, then DISPOSE the context so
    // its session cookie cannot leak into context B.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const name = `QA Persist ${RUN}`;
    const code = await createAccount(pageA, { name });
    expect(code).toMatch(CODE_RE);
    created.push(`${name} -> ${code}`);
    await ctxA.close();

    // Context B — brand-new, zero cookies. If the user only lived in a cookie,
    // resuming here is impossible. Landing on /predict signed-in proves Neon.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    // Sanity: B starts with NO mp_session cookie.
    const before = await ctxB.cookies();
    expect(before.find((c) => c.name === "mp_session")).toBeUndefined();

    await continueWithCode(pageB, code); // asserts URL ends /predict internally
    await expect(pageB).toHaveURL(/\/predict$/);
    // Signed-in proof on the page itself: the save bar (signed-in only) is shown
    // and the signed-out "Create your account" join CTA is NOT.
    await expect(
      pageB.getByRole("button", { name: /Save my picks/i }),
    ).toBeVisible();
    await expect(
      pageB.getByRole("link", { name: /Create your account/i }),
    ).toHaveCount(0);

    // And context B now HAS a fresh session cookie minted by the resume.
    const after = await ctxB.cookies();
    expect(after.find((c) => c.name === "mp_session")).toBeDefined();

    await ctxB.close();
  });

  // ---- 4. PERSISTENCE: batch-saved picks survive into a FRESH context -----
  test("4 · picks saved across multiple matchdays resume in a FRESH context (picks persisted in Neon)", async ({
    browser,
  }) => {
    // Context A — sign in, pick a winner in the FIRST (default-open) matchday
    // AND in a SECOND matchday section, then batch-save.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const name = `QA Picks ${RUN}`;
    const code = await createAccount(pageA, { name });
    expect(code).toMatch(CODE_RE);
    created.push(`${name} -> ${code}`);

    await pageA.goto("/predict");
    await expect(
      pageA.getByRole("heading", { name: /Your picks/i }),
    ).toBeVisible();

    // MULTIPLE matchday sections exist (the batch-prediction feature).
    const summaries = pageA.getByText(/Matchday\s+\d+\s+·/);
    expect(await summaries.count()).toBeGreaterThan(1);

    // Pick the FIRST option in the first (open) matchday section. Capture its
    // accessible name so we can re-find the very same radio on resume.
    const firstGroup = pageA.getByRole("radiogroup").first();
    await expect(firstGroup).toBeVisible();
    const firstGroupName = (await firstGroup.getAttribute("aria-label")) ?? "";
    // The home team's name = the text before " vs " in the group's aria-label
    // (e.g. "Mexico vs South Africa — Tap who wins. …" -> "Mexico"). This is the
    // FIRST radio's team, which we click below.
    const pickATeam = firstGroupName.split(/\s+vs\s+/i)[0]?.trim() ?? "";
    const pickA = firstGroup.getByRole("radio").first();
    await pickA.click();
    await expect(pickA).toHaveAttribute("aria-checked", "true");

    // Expand a SECOND matchday section and pick a winner there too, so the
    // batch save spans more than one matchday.
    const groupsBefore = await pageA.getByRole("radiogroup").count();
    await summaries.nth(1).click();
    await expect
      .poll(async () => pageA.getByRole("radiogroup").count())
      .toBeGreaterThan(groupsBefore);
    const secondPick = pageA
      .getByRole("radiogroup")
      .nth(groupsBefore)
      .getByRole("radio")
      .first();
    await secondPick.click();
    await expect(secondPick).toHaveAttribute("aria-checked", "true");

    // Batch-save -> success (Picks locked in…), with role="status".
    const save = pageA.getByRole("button", { name: /Save my picks/i });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(pageA.getByText(/Picks locked in/i)).toBeVisible();
    await ctxA.close();

    // Context B — fresh, cookie-less. Resume with the same code; the saved pick
    // in the FIRST (default-open) section must come back pre-selected. Only Neon
    // can carry that across a brand-new browser context.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await continueWithCode(pageB, code);
    await expect(pageB).toHaveURL(/\/predict$/);

    // Re-find the SAME radiogroup by its accessible name. We clicked its FIRST
    // radio in context A, so on resume that exact radio must come back checked —
    // and no other radio in the group is. Asserting the first option directly
    // (rather than matching on the radio's concatenated label text, which has no
    // space between "Mexico" and "to win") is the precise, robust proof.
    const resumedGroup = firstGroupName
      ? pageB.getByRole("radiogroup", { name: firstGroupName })
      : pageB.getByRole("radiogroup").first();
    await expect(resumedGroup).toBeVisible();
    const resumedFirstRadio = resumedGroup.getByRole("radio").first();
    await expect(resumedFirstRadio).toHaveAttribute("aria-checked", "true");
    // Belt-and-braces: the radio's accessible name still names the team we picked.
    await expect(resumedFirstRadio).toHaveAccessibleName(
      new RegExp(escapeRe(pickATeam), "i"),
    );
    // And the per-matchday summary in the same section reflects the saved pick.
    await expect(
      pageB.getByText(/Matchday\s+1\s+·[\s\S]*1\/\d+\s+picked/),
    ).toBeVisible();
    await ctxB.close();
  });

  // ---- 5. Predict shows multiple matchdays, nothing locked; scoreboard empty
  test("5 · /predict shows multiple matchday sections nothing locked; /scoreboard is empty-state", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const name = `QA Slate ${RUN}`;
    const code = await createAccount(page, { name });
    created.push(`${name} -> ${code}`);

    await page.goto("/predict");
    await expect(page.getByRole("heading", { name: /Your picks/i })).toBeVisible();

    // Multiple matchday sections.
    const summaries = page.getByText(/Matchday\s+\d+\s+·/);
    expect(await summaries.count()).toBeGreaterThan(1);

    // Nothing locked pre-tournament: there is NO "Already locked" section, and
    // every visible open card exposes a pickable radiogroup (not a read-only
    // LockedView). The default-open section shows pickable radios.
    await expect(page.getByRole("heading", { name: /^Already locked$/ })).toHaveCount(0);
    await expect(page.getByRole("radiogroup").first()).toBeVisible();
    expect(await page.getByRole("radio").count()).toBeGreaterThan(0);

    // Scoreboard pre-tournament empty-state. NOTE: the literal "No results in
    // yet" placeholder only renders when ZERO departments are eligible (the
    // 3-active-member guard). On the live DB, departments with >=3 members are
    // eligible, so the race renders — but with NOTHING scored: every points
    // value is 0.0 and there is no "mover of the week". That zero-everywhere
    // board IS the pre-tournament empty state, and is what we assert.
    await page.goto("/scoreboard");
    await expect(page.getByRole("heading", { name: /^The race$/ })).toBeVisible();

    const race = page.getByRole("list", { name: /Department race standings/i });
    if (await race.count()) {
      // Eligible departments exist -> the race shows, but every point total is 0.
      // Both the rank chip AND the points value carry the `.tnum` class; only the
      // points value is decimal-formatted (avgPoints.toFixed(1) -> "X.Y"), while
      // the rank chip is a bare integer. Keep only the decimal cells = points.
      const tnums = await race.locator(".tnum").allTextContents();
      const pointTexts = tnums.map((t) => t.trim()).filter((t) => /\.\d/.test(t));
      const nums = pointTexts
        .map((t) => parseFloat(t))
        .filter((n) => !Number.isNaN(n));
      expect(nums.length, `expected decimal point cells, saw tnum: ${tnums}`).toBeGreaterThan(0);
      expect(
        nums.every((n) => n === 0),
        `pre-tournament: every department points value must be 0, got ${pointTexts}`,
      ).toBe(true);
    } else {
      // Truly empty DB (no eligible dept) -> the no-results placeholder shows.
      await expect(page.getByText(/No results in yet/i)).toBeVisible();
    }
    // Either way: nothing has been scored, so no "mover of the week" badge.
    await expect(page.getByText(/mover of the week/i)).toHaveCount(0);

    await ctx.close();
  });

  // ---- 6. Report cookie flags + collect console/page errors ---------------
  test("6 · session cookie flags (httpOnly, Secure, SameSite) + console/page errors", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = captureErrors(page);

    const name = `QA Cookie ${RUN}`;
    const code = await createAccount(page, { name });
    created.push(`${name} -> ${code}`);

    // Visit a few surfaces to surface any client errors.
    await page.goto("/predict");
    await expect(page.getByRole("heading", { name: /Your picks/i })).toBeVisible();
    await page.goto("/scoreboard");
    // The scoreboard renders (race header is always present); pre-tournament it
    // is unscored. We don't re-assert the empty state here (test 5 owns that) —
    // this test is about the cookie + error capture.
    await expect(page.getByRole("heading", { name: /^The race$/ })).toBeVisible();

    const cookies = await ctx.cookies();
    const session = cookies.find((c) => c.name === "mp_session");
    expect(session, "mp_session cookie must exist after sign-in").toBeDefined();

    // The required security flags on the prod (HTTPS) deployment.
    expect(session!.httpOnly, "mp_session must be httpOnly").toBe(true);
    expect(session!.secure, "mp_session must be Secure on HTTPS prod").toBe(true);
    expect(
      (session!.sameSite ?? "").toLowerCase(),
      "mp_session sameSite",
    ).toBe("lax");

    // Surface what we observed for the human report.
    console.log(
      `[REPORT] mp_session flags: httpOnly=${session!.httpOnly} secure=${session!.secure} sameSite=${session!.sameSite} path=${session!.path} domain=${session!.domain}`,
    );
    console.log(`[REPORT] console.error count: ${errs.console.length}`);
    if (errs.console.length) console.log(`[REPORT] console errors: ${JSON.stringify(errs.console)}`);
    console.log(`[REPORT] pageerror count: ${errs.pageErrors.length}`);
    if (errs.pageErrors.length) console.log(`[REPORT] page errors: ${JSON.stringify(errs.pageErrors)}`);

    expect(errs.pageErrors, "no uncaught page errors on prod surfaces").toEqual([]);
    await ctx.close();
  });

  test.afterAll(() => {
    if (created.length) {
      console.log(`\n[REPORT] Test accounts created in PROD (${created.length}):`);
      for (const c of created) console.log(`  - ${c}`);
    }
  });
});

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
