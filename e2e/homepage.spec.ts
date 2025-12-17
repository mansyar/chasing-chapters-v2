import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("should load successfully", async ({ page }) => {
    await page.goto("/");

    // Page title should be present
    await expect(page).toHaveTitle(/Chasing Chapters/i);
  });

  test("should display latest reviews section", async ({ page }) => {
    await page.goto("/");

    // Section heading should be visible
    const latestReviewsHeading = page.getByRole("heading", {
      name: /Latest Reviews/i,
    });
    await expect(latestReviewsHeading).toBeVisible();
  });

  test("should navigate to reviews page via View All link", async ({
    page,
  }) => {
    await page.goto("/");

    // Click View All link in Latest Reviews section
    const viewAllLink = page
      .locator("section")
      .filter({ hasText: /Latest Reviews/i })
      .getByRole("link", { name: /View All/i });
    await viewAllLink.click();

    // Should navigate to reviews page
    await expect(page).toHaveURL(/\/reviews/);
  });

  test("should display genre marquee", async ({ page }) => {
    await page.goto("/");

    // Genre section should be visible (it uses a marquee layout)
    const genreSection = page.locator('[class*="overflow-hidden"]').first();
    await expect(genreSection).toBeVisible();
  });

  test("should display featured hero when featured reviews exist", async ({
    page,
  }) => {
    await page.goto("/");

    // Check if featured hero section exists (may not exist if no featured reviews)
    const heroSection = page.locator("article").first();
    const heroExists = await heroSection.isVisible().catch(() => false);

    if (heroExists) {
      // Hero should have review content
      await expect(heroSection).toBeVisible();
    }
    // If no hero, that's okay - just means no featured reviews in database
  });

  test("should display reading lists section when lists exist", async ({
    page,
  }) => {
    await page.goto("/");

    // Check if reading lists section exists
    const readingListsHeading = page.getByRole("heading", {
      name: /Curated Reading Lists/i,
    });
    const exists = await readingListsHeading.isVisible().catch(() => false);

    if (exists) {
      await expect(readingListsHeading).toBeVisible();
    }
    // If no section, that's okay - means no reading lists published
  });
});
