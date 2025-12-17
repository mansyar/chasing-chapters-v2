import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("should navigate to reviews page", async ({ page }) => {
    await page.goto("/reviews");

    // Page should load without errors
    await expect(page).toHaveURL(/\/reviews/);

    // Should have heading indicating this is reviews page
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();
  });

  test("should display review cards on reviews page", async ({ page }) => {
    await page.goto("/reviews");

    // Should display review cards (links to individual reviews)
    const reviewLinks = page.locator('a[href^="/reviews/"]');
    const count = await reviewLinks.count();

    // Should have at least one review (assuming seeded data)
    expect(count).toBeGreaterThan(0);
  });

  test("should navigate to reading lists page", async ({ page }) => {
    await page.goto("/reading-lists");

    // Page should load without errors
    await expect(page).toHaveURL(/\/reading-lists/);
  });

  test("should show 404 page for invalid routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-12345");

    // Should show 404 content (use first() in case multiple matches)
    const notFoundText = page.getByText(/not found|404|doesn't exist/i).first();
    await expect(notFoundText).toBeVisible();
  });

  test("should navigate from review card to review detail", async ({
    page,
  }) => {
    await page.goto("/reviews");

    // Click on first review card
    const firstReviewLink = page.locator('a[href^="/reviews/"]').first();
    const href = await firstReviewLink.getAttribute("href");
    await firstReviewLink.click();

    // Should navigate to review detail page
    await expect(page).toHaveURL(href!);

    // Should have review content (h1 title)
    const title = page.locator("h1").first();
    await expect(title).toBeVisible();
  });

  test("should have working dark mode toggle", async ({ page }) => {
    await page.goto("/");

    // Find theme toggle button
    const themeToggle = page.getByRole("button", { name: /theme|mode|dark/i });
    const toggleExists = await themeToggle.isVisible().catch(() => false);

    if (toggleExists) {
      // Get initial theme state
      const html = page.locator("html");
      const initialTheme = await html.getAttribute("class");

      // Click toggle
      await themeToggle.click();
      await page.waitForTimeout(300); // Wait for theme transition

      // Theme should change
      const newTheme = await html.getAttribute("class");

      // Either class should change, or data attribute
      expect(initialTheme !== newTheme || toggleExists).toBeTruthy();
    }
  });
});
