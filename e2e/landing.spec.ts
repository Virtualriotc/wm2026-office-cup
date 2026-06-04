import { test, expect } from "@playwright/test";

// Landing page: hero, the two join cards, the steps, the nav, and the
// unofficial / no-betting compliance tag.
test.describe("Landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the hero headline and the what-is-this line", async ({ page }) => {
    // The display headline is split into two lines: "WM 2026" / "OFFICE CUP".
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ hasText: /OFFICE CUP/i }),
    ).toBeVisible();
    // The bold one-liner above the CTA (replaced the old "Call the winners" tag).
    await expect(
      page.getByText(/which department has the best ball knowledge/i).first(),
    ).toBeVisible();
  });

  test("shows the unofficial / no-betting tag", async ({ page }) => {
    await expect(
      page.getByText(/UNOFFICIAL OFFICE GAME · NO BETTING/i).first(),
    ).toBeVisible();
  });

  test("shows the two join cards: New here? and Have a code?", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: /Grab your spot/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Welcome back/i }),
    ).toBeVisible();
    // New-here form controls.
    await expect(page.getByLabel("What should we call you?")).toBeVisible();
    await expect(page.getByLabel("Your department")).toBeVisible();
    // Have-a-code form control.
    await expect(page.getByLabel("Your code")).toBeVisible();
  });

  test("shows the four how-it-works steps", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /How it works/i })).toBeVisible();
    for (const label of [
      "Create your account",
      "Save your code",
      "Pick your matches",
      "Watch the scores roll in",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("primary nav links to the four surfaces", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Predict" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Scoreboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Organizer" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Account" })).toBeVisible();
  });

  test("Account nav link redirects signed-out visitors to the join surface", async ({ page }) => {
    await page.getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Account" })
      .click();
    // Signed out, /account redirects HOME (joining belongs there, where the
    // one-time code reveal survives — not on /account, which would swap it away).
    await expect(page).not.toHaveURL(/\/account/);
    // Home carries both join cards, so the funnel isn't broken.
    await expect(
      page.getByRole("heading", { name: /Welcome back/i }),
    ).toBeVisible();
  });

  test("shows demo-mode banner (mock store)", async ({ page }) => {
    await expect(page.getByText(/Demo mode — running on sample data/i)).toBeVisible();
  });
});
