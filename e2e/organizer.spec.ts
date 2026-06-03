import { test, expect } from "@playwright/test";
import { ORGANIZER_CODE, CRON_SECRET } from "../playwright.config";

// Organizer surface is gated; the cron sync route is CRON_SECRET-protected and
// fails closed.
test.describe("Organizer gate", () => {
  test("blocks the organizer area without the code", async ({ browser }) => {
    const context = await browser.newContext(); // no cookies
    const page = await context.newPage();
    await page.goto("/organizer");

    // The code gate is shown, not the authoritative confirm UI.
    await expect(
      page.getByRole("heading", { name: /Results & overrides/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/Organizer code/i)).toBeVisible();
    // No matchday confirm rows are exposed behind the gate.
    await expect(page.getByText(/Auto-synced/i)).toHaveCount(0);
    await context.close();
  });

  test("a wrong code is rejected at the gate", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/organizer");
    const field = page.getByLabel(/Organizer code/i);
    await field.fill("NOPE-NOT-THE-CODE");
    // toHaveValue waits for the controlled input's React state to settle, so the
    // submit handler (which reads state, not the DOM) sees the code post-click.
    await expect(field).toHaveValue("NOPE-NOT-THE-CODE");
    await page.getByRole("button", { name: /Unlock/i }).click();
    await expect(page.getByText(/doesn't open the organizer/i)).toBeVisible();
    await context.close();
  });

  test("the correct code unlocks the organizer surface", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/organizer");
    const field = page.getByLabel(/Organizer code/i);
    await field.fill(ORGANIZER_CODE);
    await expect(field).toHaveValue(ORGANIZER_CODE);
    await page.getByRole("button", { name: /Unlock/i }).click();

    // Unlocked: the heartbeat / seed controls and per-day match sections show.
    await expect(
      page.getByRole("heading", { name: /Results & overrides/i }),
    ).toBeVisible();
    // The gate's single password input should be gone; the seed control appears.
    await expect(page.getByLabel(/Organizer code/i)).toHaveCount(0);
    await context.close();
  });
});

test.describe("Cron sync route protection", () => {
  test("rejects an unauthenticated request (no/incorrect bearer)", async ({
    request,
  }) => {
    const res = await request.get("/api/cron/sync");
    // With CRON_SECRET set, a missing/incorrect Authorization is 401.
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  test("rejects a wrong bearer token", async ({ request }) => {
    const res = await request.get("/api/cron/sync", {
      headers: { authorization: "Bearer totally-wrong" },
    });
    expect(res.status()).toBe(401);
  });

  test("accepts the correct CRON_SECRET bearer", async ({ request }) => {
    const res = await request.get("/api/cron/sync", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
