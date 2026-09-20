import { test, expect } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/auth/login");

  await expect(page.getByAltText("Lighthouse Project Management")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
