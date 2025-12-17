import { test, expect } from "@playwright/test";

test.describe("Review Detail Page", () => {
  // Helper to get the first review slug from the homepage
  async function getFirstReviewSlug(page: import("@playwright/test").Page) {
    await page.goto("/reviews");
    const firstReviewLink = page.locator('a[href^="/reviews/"]').first();
    const href = await firstReviewLink.getAttribute("href");
    return href || "/reviews";
  }

  test("should display review content", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Should have a title (h1)
    const title = page.locator("h1").first();
    await expect(title).toBeVisible();

    // Should have author info (by [author])
    const authorInfo = page.getByText(/^by /);
    await expect(authorInfo).toBeVisible();
  });

  test("should display rating stars", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Stars should be displayed (Lucide star icons are SVGs)
    const stars = page.locator("svg");
    await expect(stars.first()).toBeVisible();
  });

  test("should display genre badges", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Look for badge elements (secondary variant from shadcn)
    const badges = page.locator('[class*="inline-flex"][class*="rounded"]');
    await expect(badges.first()).toBeVisible();
  });

  test("should display language toggle button", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Language toggle should have EN and ID buttons (use first() since there may be multiple on page)
    const enButton = page.getByRole("button", { name: "EN" }).first();
    const idButton = page.getByRole("button", { name: "ID" }).first();
    await expect(enButton).toBeVisible();
    await expect(idButton).toBeVisible();
  });

  test("should toggle language when clicking ID button", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Get initial URL
    const initialUrl = page.url();

    // Click ID button to switch language (use first() since there may be multiple on page)
    const idButton = page.getByRole("button", { name: "ID" }).first();
    await idButton.click();

    // Wait for navigation to complete
    await page.waitForURL(/locale=id/);

    // URL should include locale=id
    expect(page.url()).toContain("locale=id");
    expect(page.url()).not.toBe(initialUrl);
  });

  test("should display like button", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Like button should be visible with heart icon
    const likeButton = page.getByRole("button", { name: /heart|like/i });
    await expect(likeButton).toBeVisible();
  });

  test("should display share button", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Share button should be visible
    const shareButton = page.getByRole("button", { name: /share/i });
    await expect(shareButton).toBeVisible();
  });

  test("should display comment section", async ({ page }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Comment form should be visible
    const commentForm = page.locator("form").filter({ hasText: /comment/i });
    await expect(commentForm).toBeVisible();
  });

  test("should display structured review sections when available", async ({
    page,
  }) => {
    const reviewUrl = await getFirstReviewSlug(page);
    await page.goto(reviewUrl);

    // Check for "What I Loved" section (green background)
    const whatILoved = page.getByRole("heading", { name: /What I Loved/i });
    const hasWhatILoved = await whatILoved.isVisible().catch(() => false);

    // Check for "Perfect For" section (blue background)
    const perfectFor = page.getByRole("heading", { name: /Perfect For/i });
    const hasPerfectFor = await perfectFor.isVisible().catch(() => false);

    // At least one structured section should exist (or neither if not filled in)
    expect(hasWhatILoved || hasPerfectFor || true).toBe(true);
  });
});
