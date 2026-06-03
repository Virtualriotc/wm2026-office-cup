import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

// Predict screen: matchday cards render, picking a winner, and saving to a
// success state. Requires a signed-in user (picks are gated on auth).
test.describe("Predict", () => {
  test("signed-in user can pick a winner and save to success", async ({
    page,
  }) => {
    // Sign in by creating an account (sets the session cookie).
    await createAccount(page, { name: "Predictor " + Date.now() });
    await page.goto("/predict");

    // The matchday header + heading render.
    await expect(page.getByRole("heading", { name: /Your picks/i })).toBeVisible();

    // At least one OPEN match card with a radiogroup of options.
    const radiogroup = page.getByRole("radiogroup").first();
    await expect(radiogroup).toBeVisible();

    // Pick the first option (Home/team-to-win). The option is a motion.button
    // with a pop-in/whileTap; click() auto-waits for it to be stable.
    const firstOption = radiogroup.getByRole("radio").first();
    await firstOption.click();
    await expect(firstOption).toHaveAttribute("aria-checked", "true");

    // Save. The save bar is sticky at the bottom for signed-in users; it enables
    // once at least one pick is made.
    const save = page.getByRole("button", { name: /Save my picks/i });
    await expect(save).toBeEnabled();
    await save.click();

    // Success state: a status message confirming the picks were saved.
    await expect(page.getByText(/Picks locked in/i)).toBeVisible();
  });

  test("shows the full slate grouped into MULTIPLE matchday sections", async ({
    page,
  }) => {
    // Default real schedule (+ the demo's three faked-past group games): the
    // predictable slate spans many future days, so the board renders several
    // collapsible "Matchday N" sections, the first expanded.
    await createAccount(page, { name: "Batch Picker " + Date.now() });
    await page.goto("/predict");

    await expect(page.getByRole("heading", { name: /Your picks/i })).toBeVisible();

    // Each matchday section is a <details><summary>Matchday N · …</summary>.
    // More than one matchday summary is shown (the batch-prediction feature).
    const summaries = page.getByText(/Matchday\s+\d+\s+·/);
    expect(await summaries.count()).toBeGreaterThan(1);

    // The soonest section is expanded by default (its <details> has [open]),
    // so at least one pickable radiogroup is visible without expanding anything.
    await expect(page.getByRole("radiogroup").first()).toBeVisible();

    // A later, collapsed section's cards are hidden until it's expanded; click
    // its summary to reveal them.
    const visibleBefore = await page.getByRole("radiogroup").count();
    await summaries.nth(1).click();
    await expect
      .poll(async () => page.getByRole("radiogroup").count())
      .toBeGreaterThan(visibleBefore);
  });

  test("visitor without a session sees the join prompt, not pick controls", async ({
    browser,
  }) => {
    // A brand-new context => no session cookie.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/predict");

    await expect(
      page.getByRole("link", { name: /Create your account/i }),
    ).toBeVisible();
    // No interactive pick radios for an open match when signed out.
    await expect(page.getByRole("radio")).toHaveCount(0);
    await context.close();
  });
});
