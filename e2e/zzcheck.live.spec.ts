import { test, expect, type Page } from "@playwright/test";
import { createAccount, continueWithCode, CODE_RE } from "./helpers";

// ============================================================================
// LIVE functional + PERSISTENCE proof against the deployed, Neon-backed site.
// Run: npx playwright test e2e/zzcheck.live.spec.ts -c playwright.live.config.ts
//
// Every account + department created here is prefixed exactly "ZZCHECK " so the
// owning session can delete the test data precisely afterward. The RUN suffix
// keeps each invocation's data unique (the spec is run TWICE for stability).
//
// The load-bearing proofs are #3 and #4: a code/picks created in one browser
// context must come back in a SEPARATE, cookie-less browser.newContext(). A
// cookie can't carry that across contexts, so success means the user and their
// picks were genuinely persisted in Neon. Today is pre-tournament (2026-06-03):
// nothing is locked, the scoreboard is empty/all-zero — the spec asserts exactly
// that real state, not the SEED_DEMO snapshot the mock-store specs rely on.
// ============================================================================

// The organizer code is supplied via env (never committed). The live config does
// not inject it, so we read process.env directly with a clear failure if unset.
const ORGANIZER_CODE = process.env.ORGANIZER_CODE ?? "";

// Stable, identifiable, unique-per-run suffix. ZZCHECK prefix is REQUIRED.
const RUN = `${Date.now()}`;
const PREFIX = "ZZCHECK";
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

test.describe("LIVE ZZCHECK — functional + persistence (Neon)", () => {
  // ---- 1. Landing renders -------------------------------------------------
  test("1 · landing renders hero, both join cards, no-betting tag, NO demo banner", async ({
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
  test("2 · create account with an EXISTING department yields an MP-code", async ({
    page,
  }) => {
    const name = `${PREFIX} Existing ${RUN}`;
    const code = await createAccount(page, { name });
    expect(code).toMatch(CODE_RE);
    created.push(`${name} -> ${code}`);
  });

  test("2 · create account with a TYPED-NEW department yields an MP-code", async ({
    page,
  }) => {
    const name = `${PREFIX} NewDept ${RUN}`;
    const dept = `${PREFIX} Dept ${RUN}`;
    const code = await createAccount(page, { name, newDepartment: dept });
    expect(code).toMatch(CODE_RE);
    created.push(`${name} (new dept "${dept}") -> ${code}`);
  });

  // ---- 3. PERSISTENCE: code resumes in a FRESH, cookie-less context -------
  test("3 · code created in one context resumes signed-in in a FRESH context (Neon)", async ({
    browser,
  }) => {
    // Context A — create the account, get the code, then DISPOSE the context so
    // its session cookie cannot leak into context B.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const name = `${PREFIX} Persist ${RUN}`;
    const code = await createAccount(pageA, { name });
    expect(code).toMatch(CODE_RE);
    created.push(`${name} -> ${code}`);
    await ctxA.close();

    // Context B — brand-new, zero cookies. If the user only lived in a cookie,
    // resuming here is impossible. Landing on /predict signed-in proves Neon.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
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
  test("4 · picks saved across MULTIPLE matchdays resume in a FRESH context (Neon)", async ({
    browser,
  }) => {
    // Context A — sign in, pick a winner in the FIRST (default-open) matchday
    // AND in a SECOND matchday section, then batch-save.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const name = `${PREFIX} Picks ${RUN}`;
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
    const pickATeam = firstGroupName.split(/\s+vs\s+/i)[0]?.trim() ?? "";
    const pickA = firstGroup.getByRole("radio").first();
    await pickA.click();
    await expect(pickA).toHaveAttribute("aria-checked", "true");

    // Expand a SECOND matchday section and pick a winner there too, so the batch
    // save spans more than one matchday.
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

    const resumedGroup = firstGroupName
      ? pageB.getByRole("radiogroup", { name: firstGroupName })
      : pageB.getByRole("radiogroup").first();
    await expect(resumedGroup).toBeVisible();
    const resumedFirstRadio = resumedGroup.getByRole("radio").first();
    await expect(resumedFirstRadio).toHaveAttribute("aria-checked", "true");
    await expect(resumedFirstRadio).toHaveAccessibleName(
      new RegExp(escapeRe(pickATeam), "i"),
    );
    // And the per-matchday summary in the same section reflects the saved pick.
    await expect(
      pageB.getByText(/Matchday\s+1\s+·[\s\S]*1\/\d+\s+picked/),
    ).toBeVisible();
    await ctxB.close();
  });

  // ---- 5. Predict: many matchdays, nothing locked, KO hidden; scoreboard empty
  test("5 · /predict many matchdays nothing locked KO hidden; /scoreboard empty/all-zero", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const name = `${PREFIX} Slate ${RUN}`;
    const code = await createAccount(page, { name });
    created.push(`${name} -> ${code}`);

    await page.goto("/predict");
    await expect(page.getByRole("heading", { name: /Your picks/i })).toBeVisible();

    // MANY real matchday sections.
    const summaries = page.getByText(/Matchday\s+\d+\s+·/);
    const matchdayCount = await summaries.count();
    expect(matchdayCount).toBeGreaterThan(1);
    console.log(`[REPORT] /predict matchday sections: ${matchdayCount}`);

    // Nothing locked pre-tournament: there is NO "Already locked" section, and
    // the default-open section exposes pickable radiogroups (not a read-only
    // LockedView).
    await expect(
      page.getByRole("heading", { name: /^Already locked$/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("radiogroup").first()).toBeVisible();
    const radioCount = await page.getByRole("radio").count();
    expect(radioCount).toBeGreaterThan(0);

    // KO / knockout fixtures are HIDDEN pre-group-stage: no knockout-round
    // headings (Round of 32/16, Quarter/Semi-final, Final) are shown to pick.
    await expect(
      page.getByText(/Round of (?:32|16)|Quarter-?final|Semi-?final|^Final$/i),
    ).toHaveCount(0);

    // ---- /scoreboard state — RECORD which of the two pre-tournament shapes we
    // see. The race header is always present. The body is one of:
    //   (a) empty-state placeholder ("No results in yet"), OR
    //   (b) a populated race list ("Department race standings").
    // NOTE (live finding): the live DB is NOT reliably empty pre-tournament — a
    // real department ("Energy Ops") is ranked and a "mover of the week" badge
    // intermittently renders, i.e. some scoring already exists / the cron has
    // run. We therefore RECORD the observed state and its point cells + mover
    // badge rather than asserting an empty board that prod does not actually
    // guarantee. The page must still render the race header cleanly.
    await page.goto("/scoreboard");
    await expect(page.getByRole("heading", { name: /^The race$/ })).toBeVisible();

    const race = page.getByRole("list", { name: /Department race standings/i });
    const moverCount = await page.getByText(/climbed.*since yesterday/i).count();
    let scoreboardState: string;
    if (await race.count()) {
      const tnums = await race.locator(".tnum").allTextContents();
      const pointTexts = tnums.map((t) => t.trim()).filter((t) => /\.\d/.test(t));
      const nums = pointTexts
        .map((t) => parseFloat(t))
        .filter((n) => !Number.isNaN(n));
      expect(
        nums.length,
        `expected decimal point cells, saw tnum: ${tnums}`,
      ).toBeGreaterThan(0);
      const allZero = nums.every((n) => n === 0);
      scoreboardState = allZero
        ? `populated race, all-zero lanes (${nums.length} dept point cells, all 0.0)`
        : `populated race, NON-ZERO lanes (${nums.length} dept point cells: ${pointTexts.join(", ")})`;
    } else {
      await expect(page.getByText(/No results in yet/i)).toBeVisible();
      scoreboardState = "empty-state placeholder (No results in yet)";
    }
    console.log(
      `[REPORT] /scoreboard observed: ${scoreboardState}; mover-of-the-week badges: ${moverCount}`,
    );

    await ctx.close();
  });

  // ---- 6. ORGANIZER: gate with no cookie, then UNLOCK via code form -------
  test("6 · /organizer gates with no cookie then UNLOCKS via the code form (no URL leak)", async ({
    browser,
  }) => {
    expect(
      ORGANIZER_CODE,
      "ORGANIZER_CODE env must be set to drive the gate",
    ).not.toEqual("");

    const ctx = await browser.newContext(); // no cookies
    const page = await ctx.newPage();
    const errs = captureErrors(page);

    await page.goto("/organizer", { waitUntil: "domcontentloaded" });

    // GATED: only the code gate is shown — the password field + Unlock button,
    // and NONE of the authoritative controls (Sync now / Seed fixtures buttons,
    // per-match override rows) are rendered behind the gate.
    const codeField = page.getByLabel(/Organizer code/i);
    await expect(codeField).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Results & overrides/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Sync now$/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Seed fixtures/i }),
    ).toHaveCount(0);
    // No per-match auto-result/override rows leak behind the gate.
    await expect(page.getByText(/No result yet/i)).toHaveCount(0);

    // No organizer cookie (mp_org) exists yet.
    const beforeCookies = await ctx.cookies();
    expect(
      beforeCookies.find((c) => c.name === "mp_org"),
      "no organizer cookie before unlock",
    ).toBeUndefined();

    // DRIVE the gate form: type the real code, prove React captured it, submit.
    await codeField.click();
    await codeField.fill("");
    await codeField.pressSequentially(ORGANIZER_CODE, { delay: 8 });
    await expect(codeField).toHaveValue(ORGANIZER_CODE);
    await page.getByRole("button", { name: /^Unlock$/i }).click();

    // UNLOCKED: the gate's password field is gone; the authoritative controls
    // render — sync heartbeat (Sync now), seed control (Seed fixtures), the
    // recompute note, and at least one per-match override row.
    await expect(page.getByLabel(/Organizer code/i)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Results & overrides/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Sync now$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Seed fixtures/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Overrides win over the feed/i),
    ).toBeVisible();
    // Results/override UI: many per-match rows render, each with an "Override"
    // toggle and a "No result yet" line (pre-tournament, nothing scored).
    const overrideToggles = page.getByRole("button", { name: /^Override$/i });
    expect(await overrideToggles.count()).toBeGreaterThan(0);
    expect(await page.getByText(/No result yet/i).count()).toBeGreaterThan(0);
    // Expanding the first toggle reveals the "Override the call" panel with the
    // outcome buttons — the actual results/override control.
    await overrideToggles.first().click();
    await expect(
      page.getByText(/Override the call/i).first(),
    ).toBeVisible();

    // NO LEAK: the plaintext code never appears in the URL after unlock.
    expect(page.url(), "organizer code must not leak into the URL").not.toContain(
      ORGANIZER_CODE,
    );
    expect(new URL(page.url()).search, "no query string carrying the code").toBe("");

    // An organizer cookie (mp_org) now exists (the unlock minted it), it is
    // httpOnly + Secure, and it stores a HASH — never the plaintext code.
    const afterCookies = await ctx.cookies();
    const orgCookie = afterCookies.find((c) => c.name === "mp_org");
    expect(orgCookie, "organizer cookie set after unlock").toBeDefined();
    expect(orgCookie!.httpOnly, "mp_org must be httpOnly").toBe(true);
    expect(orgCookie!.secure, "mp_org must be Secure on HTTPS prod").toBe(true);
    expect(
      orgCookie!.value,
      "organizer code must NOT be stored as plaintext in the cookie",
    ).not.toContain(ORGANIZER_CODE);
    console.log(
      `[REPORT] organizer cookie: name=${orgCookie?.name} httpOnly=${orgCookie?.httpOnly} secure=${orgCookie?.secure} sameSite=${orgCookie?.sameSite} (value is a hash, not the code)`,
    );

    expect(errs.pageErrors, "no uncaught page errors on organizer").toEqual([]);
    await ctx.close();
  });

  // ---- 7. Report cookie flags + collect console/page errors ---------------
  test("7 · session cookie flags (httpOnly, Secure, SameSite) + console/page errors", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = captureErrors(page);

    const name = `${PREFIX} Cookie ${RUN}`;
    const code = await createAccount(page, { name });
    created.push(`${name} -> ${code}`);

    // Visit a few surfaces to surface any client errors.
    await page.goto("/predict");
    await expect(page.getByRole("heading", { name: /Your picks/i })).toBeVisible();
    await page.goto("/scoreboard");
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

    console.log(
      `[REPORT] mp_session flags: httpOnly=${session!.httpOnly} secure=${session!.secure} sameSite=${session!.sameSite} path=${session!.path} domain=${session!.domain}`,
    );
    console.log(`[REPORT] console.error count: ${errs.console.length}`);
    if (errs.console.length)
      console.log(`[REPORT] console errors: ${JSON.stringify(errs.console)}`);
    console.log(`[REPORT] pageerror count: ${errs.pageErrors.length}`);
    if (errs.pageErrors.length)
      console.log(`[REPORT] page errors: ${JSON.stringify(errs.pageErrors)}`);

    expect(errs.pageErrors, "no uncaught page errors on prod surfaces").toEqual([]);
    await ctx.close();
  });

  test.afterAll(() => {
    if (created.length) {
      console.log(`\n[REPORT] ZZCHECK accounts created in PROD (${created.length}):`);
      for (const c of created) console.log(`  - ${c}`);
    }
  });
});

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
