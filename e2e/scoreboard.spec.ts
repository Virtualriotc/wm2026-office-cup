import { test, expect } from "@playwright/test";

// Scoreboard: the department race renders with non-zero points and an
// overtake animation settles; the leaderboard is RELATIVE (top + your
// neighbourhood + percentile), never an absolute "#N of M" framing.
test.describe("Scoreboard", () => {
  test("department race renders ranked lanes with non-zero points", async ({
    page,
  }) => {
    await page.goto("/scoreboard");

    const race = page.getByRole("list", { name: /Department race standings/i });
    await expect(race).toBeVisible();

    // At least two eligible lanes (the seed has Energy Ops + Tech eligible).
    const lanes = race.getByRole("listitem");
    expect(await lanes.count()).toBeGreaterThanOrEqual(2);

    // Non-zero points somewhere on the board: the seed has finished games, so
    // at least one lane shows a points value > 0.0.
    const pointTexts = await race.locator(".tnum").allTextContents();
    const numbers = pointTexts
      .map((t) => parseFloat(t))
      .filter((n) => !Number.isNaN(n));
    expect(numbers.some((n) => n > 0), `points on board: ${pointTexts}`).toBe(
      true,
    );
  });

  test("the overtake animation settles into a final ranked order", async ({
    page,
  }) => {
    await page.goto("/scoreboard");
    const race = page.getByRole("list", { name: /Department race standings/i });
    await expect(race).toBeVisible();

    // Capture the lane order, wait for the FLIP/overtake to run, and confirm
    // the order is stable afterwards (the animation has a ~700ms beat then a
    // ~1.1s sweep). We assert the rank chips are a strictly increasing 1..N.
    await page.waitForTimeout(2500);
    const rankChips = await race
      .getByRole("listitem")
      .locator("span")
      .first()
      .all();
    // Read the first span (rank chip) of each lane.
    const lanes = race.getByRole("listitem");
    const count = await lanes.count();
    const ranks: number[] = [];
    for (let i = 0; i < count; i++) {
      const chip = lanes.nth(i).locator("span").first();
      ranks.push(parseInt((await chip.textContent()) ?? "0", 10));
    }
    // Ranks render top-to-bottom as 1, 2, 3, ...
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    expect(rankChips.length).toBeGreaterThan(0);
  });

  test("biggest-mover badge plays (overtake is real, not flat)", async ({
    page,
  }) => {
    await page.goto("/scoreboard");
    // The seed flips Energy Tech above Energy Ops -> a real mover-of-the-week.
    await expect(page.getByText(/climbed.*since yesterday/i)).toBeVisible();
  });

  test("leaderboard is RELATIVE: percentile + neighbourhood, never '#N of M'", async ({
    page,
  }) => {
    await page.goto("/scoreboard");

    // The "You" tab is the default. It shows a percentile framing.
    await expect(page.getByText(/Top \d+% and climbing/i)).toBeVisible();
    // Relative dividers, not an absolute "you are #N of M" string.
    await expect(page.getByText(/Top of the cup/i).first()).toBeVisible();

    const body = (await page.locator("body").textContent()) ?? "";
    // The documented pool-killer phrasing must never appear.
    expect(body).not.toMatch(/#\s*\d+\s+of\s+\d+/i);
    expect(body).not.toMatch(/\bout of\s+\d+\s+players?\b/i);
  });

  test("Departments tab shows the fairness note (avg per active member)", async ({
    page,
  }) => {
    await page.goto("/scoreboard");
    await page.getByRole("tab", { name: /Departments/i }).click();
    await expect(
      page.getByText(/average points per active player/i).first(),
    ).toBeVisible();
  });
});
