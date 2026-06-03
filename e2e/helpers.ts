import { expect, type Page } from "@playwright/test";

// A well-formed code matches: MP-[A-Z2-9]{4}-...{4}-...{4} (see lib/auth.ts).
export const CODE_RE = /MP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/;

/**
 * Re-APPLY a full form interaction until a hydration-dependent expectation holds.
 *
 * `next dev` ships server-rendered HTML first and attaches React's `onChange` a
 * beat later. Worse: when hydration completes, React reconciles the controlled
 * inputs back to their INITIAL (empty) state, silently discarding any values a
 * test typed during the gap — so a one-shot fill that "stuck" in the DOM can be
 * wiped out moments later, leaving the gated submit button disabled. (The short
 * account.spec usually wins this race; the longer, video-capturing proof tour
 * intermittently loses it.) The only robust fix is to RE-APPLY the entire form
 * on every attempt and gate on the React-driven proof (the submit enabling),
 * so whichever attempt runs after hydration sets clean, surviving state.
 */
async function applyUntil(
  apply: () => Promise<void>,
  proof: (timeoutMs: number) => Promise<void>,
  budgetMs = 45_000,
): Promise<void> {
  // The video-capturing proof tour runs under heavy CPU load, and `next dev` can
  // fire an extra Fast Refresh full reload mid-flight (the known
  // "clientReferenceManifest" dev invariant) that resets the controlled form a
  // SECOND time. Recovery is to RE-APPLY the whole form until the React-driven
  // proof (the submit enabling) holds.
  //
  // The proof MUST poll with a SHORT timeout, not the default 15s expect
  // timeout: otherwise a single pre-hydration apply parks the assertion for 15s,
  // and the outer budget only fits ~1.5 iterations — too few to outlast a reset.
  // A 2s proof window lets `toPass` re-apply fast, so many clean attempts fit the
  // budget. Neither number weakens an assertion: same proof, just polled.
  await expect(async () => {
    await apply();
    await proof(2_000);
  }).toPass({ timeout: budgetMs });
}

/**
 * Force the consent checkbox into the CHECKED state with a React-visible change.
 *
 * `isChecked()` reads the DOM, which lies during the hydration window: a click
 * landed pre-hydration mutates the DOM to checked but React's state stays false
 * (and is reconciled back on hydrate). So gating a re-check on `isChecked()`
 * means a retry never re-fires onChange, and the submit gate (which needs React
 * state, not DOM state) is stuck disabled forever. Driving uncheck→check every
 * attempt guarantees a real onChange that, once React is live, sets state true.
 */
async function ensureConsent(
  consent: import("@playwright/test").Locator,
): Promise<void> {
  await consent.uncheck();
  await consent.check();
}

/** Clear and key-type a value into a controlled input (one input event/char). */
async function retype(
  field: import("@playwright/test").Locator,
  value: string,
): Promise<void> {
  await field.click();
  await field.fill("");
  await field.pressSequentially(value, { delay: 10 });
}

/**
 * Land on "/" with the join form ready to drive. We go to a NON-document URL
 * first ("about:blank") then to "/", so each entry is a fresh navigation that
 * can't inherit a half-settled renderer/HMR state from a prior screenshot or
 * page. `domcontentloaded` (not the default 'load', which under `next dev` waits
 * on HMR assets) returns as soon as the form HTML is parsed; the callers then
 * gate every interaction on React-driven proofs, so this only controls WHEN we
 * start polling, never WHAT we assert.
 */
async function gotoLanding(page: Page): Promise<void> {
  await page.goto("about:blank");
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

/**
 * Create a fresh account via the landing "New here?" card.
 * Either picks the first existing department, or types a brand-new one.
 * Returns the one-time MP-code shown on success.
 */
export async function createAccount(
  page: Page,
  opts: { name: string; newDepartment?: string },
): Promise<string> {
  await gotoLanding(page);

  const nameField = page.getByLabel("What should we call you?");
  const consent = page.getByRole("checkbox");
  // EXACT match: once "+ Add a new department" is picked, a second field
  // labelled "Name your department" appears, and a substring
  // getByLabel("Your department") would match BOTH (strict-mode violation).
  const deptSelect = page.getByLabel("Your department", { exact: true });
  const submit = page.getByRole("button", { name: /Get my code/i });
  await expect(nameField).toBeVisible();

  // STEP 0 — prove React is live: typing name + ticking consent enables the
  // submit only once onChange handlers are attached AND survived the last
  // reload. Re-apply the whole pair each attempt to recover a mid-flight reset.
  await applyUntil(async () => {
    await retype(nameField, opts.name);
    await ensureConsent(consent);
  }, (t) => expect(submit).toBeEnabled({ timeout: t }));

  // STEP 1 — switch to a brand-new department. The conditional field renders
  // solely from React state, so its visibility proves the select's onChange
  // stuck. Re-select + re-apply name/consent each attempt to ride out a reset.
  if (opts.newDepartment) {
    const newDeptName = opts.newDepartment;
    const newDeptField = page.getByLabel("Name your department");
    await applyUntil(async () => {
      await deptSelect.selectOption({ label: "+ Add a new department" });
      // Short poll: if a reset reverted the select, the field won't render —
      // fail fast so `toPass` re-selects instead of parking for seconds.
      await expect(newDeptField).toBeVisible({ timeout: 1_500 });
      await retype(newDeptField, newDeptName);
      await retype(nameField, opts.name);
      await ensureConsent(consent);
    }, async (t) => {
      // Gate on the field AND the submit: a post-apply revert (field gone,
      // submit still stale-enabled) must not slip a click through onto the
      // reverted default department.
      await expect(newDeptField).toBeVisible({ timeout: t });
      await expect(submit).toBeEnabled({ timeout: t });
    });
  }
  await submit.click();

  // The one-time code reveal: an <output> labelled "Here's your code".
  const code = page.getByRole("status").filter({ hasText: CODE_RE });
  await expect(code).toBeVisible({ timeout: 8_000 });
  const text = (await code.textContent()) ?? "";
  const match = text.match(CODE_RE);
  expect(match, `expected an MP-code in: ${text}`).not.toBeNull();
  return match![0];
}

/** Resume an existing account by pasting a code in the "Have a code?" card. */
export async function continueWithCode(page: Page, code: string): Promise<void> {
  // Bounded reload-and-retry. This is the LAST step of the proof tour, so the
  // shared `next dev` process has had time to queue a background recompile of
  // "/", whose first re-hydration can reset the controlled code field and leave
  // Continue stuck disabled. A fresh `gotoLanding` (about:blank → "/") pulls a
  // clean document; if a reset still wins, reload and try once more. Three quick
  // attempts comfortably fit the test budget (one short form, ~10s each) and the
  // last failure propagates so a real regression still fails loudly. No assertion
  // is relaxed — every attempt drives the same field and the same gate.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await gotoLanding(page);
    try {
      const field = page.getByLabel("Your code");
      await expect(field).toBeVisible();
      // The Continue button is disabled until the field has content. Re-type via
      // keystrokes until it enables: the only reliable proof React captured the
      // value post-hydration (a DOM value set pre-hydration is reconciled away; a
      // single synthetic fill() event can also be dropped mid-settle).
      const submit = page.getByRole("button", { name: /^Continue/i });
      // 18s per attempt so three reload-retries + the URL confirm stay well under
      // the 120s test budget; the simple one-field form settles in seconds anyway.
      await applyUntil(
        () => retype(field, code),
        (t) => expect(submit).toBeEnabled({ timeout: t }),
        18_000,
      );
      await submit.click();
      // Confirm the resume actually navigated; a stalled submit would otherwise
      // look like success and skip the reload-retry that recovers it.
      await expect(page).toHaveURL(/\/predict$/, { timeout: 10_000 });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
