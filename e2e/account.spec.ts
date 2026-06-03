import { test, expect } from "@playwright/test";
import { createAccount, continueWithCode, CODE_RE } from "./helpers";

// Create-account + resume-with-code flow.
test.describe("Account flow", () => {
  test("create with an existing department reveals an MP-code", async ({
    page,
  }) => {
    const code = await createAccount(page, { name: "Test Existing Dept" });
    expect(code).toMatch(CODE_RE);
    // Reveal copy is present.
    await expect(page.getByText(/Here's your code/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Got it, let's pick/i })).toBeVisible();
  });

  test("create with a NEW department reveals an MP-code", async ({ page }) => {
    const dept = "QA Brigade " + Date.now();
    const code = await createAccount(page, {
      name: "Test New Dept",
      newDepartment: dept,
    });
    expect(code).toMatch(CODE_RE);
  });

  test("continue with a created code lands signed in on /predict", async ({
    page,
  }) => {
    const code = await createAccount(page, { name: "Resume Me" });

    // Fresh context-less resume: paste the code in the "Have a code?" card.
    await continueWithCode(page, code);

    await expect(page).toHaveURL(/\/predict$/);
    // Signed in => the save bar (a signed-in-only affordance) is reachable.
    // At minimum the join prompt should NOT be shown.
    await expect(page.getByRole("button", { name: /Create your account/i })).toHaveCount(0);
  });

  test("a bogus code is rejected with the invalid-code message", async ({
    page,
  }) => {
    await page.goto("/");
    const field = page.getByLabel("Your code");
    await expect(field).toBeVisible();
    await field.fill("MP-ZZZZ-ZZZZ-ZZZZ");
    const submit = page.getByRole("button", { name: /^Continue/i });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText(/doesn't look right/i)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
