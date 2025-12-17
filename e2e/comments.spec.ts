import { test, expect } from "@playwright/test";

test.describe("Comments", () => {
  // Helper to navigate to a review page
  async function goToFirstReview(page: import("@playwright/test").Page) {
    await page.goto("/reviews");
    const firstReviewLink = page.locator('a[href^="/reviews/"]').first();
    await firstReviewLink.click();
    await page.waitForURL(/\/reviews\/.+/);
  }

  test("should display comment form", async ({ page }) => {
    await goToFirstReview(page);

    // Name input should be visible
    const nameInput = page.getByPlaceholder("Your name");
    await expect(nameInput).toBeVisible();

    // Email input should be visible
    const emailInput = page.getByPlaceholder("your@email.com");
    await expect(emailInput).toBeVisible();

    // Comment textarea should be visible
    const commentInput = page.getByPlaceholder("Share your thoughts...");
    await expect(commentInput).toBeVisible();

    // Submit button should be visible
    const submitButton = page.getByRole("button", { name: /Submit Comment/i });
    await expect(submitButton).toBeVisible();
  });

  test("should show validation error for empty fields", async ({ page }) => {
    await goToFirstReview(page);

    // Click submit without filling form
    const submitButton = page.getByRole("button", { name: /Submit Comment/i });
    await submitButton.click();

    // Should show error message or HTML5 validation
    const nameInput = page.getByPlaceholder("Your name");
    const isInvalid = await nameInput.evaluate(
      (el) => (el as HTMLInputElement).validity?.valueMissing
    );

    // Either browser validation or custom error message
    expect(isInvalid).toBeTruthy();
  });

  test("should submit comment successfully", async ({ page }) => {
    await goToFirstReview(page);

    // Fill out the comment form with unique data
    const timestamp = Date.now();
    const nameInput = page.getByPlaceholder("Your name");
    await nameInput.fill(`Test User ${timestamp}`);

    const emailInput = page.getByPlaceholder("your@email.com");
    await emailInput.fill(`test${timestamp}@example.com`);

    const commentInput = page.getByPlaceholder("Share your thoughts...");
    await commentInput.fill(`This is a test comment ${timestamp}`);

    // Submit the form
    const submitButton = page.getByRole("button", { name: /Submit Comment/i });
    await submitButton.click();

    // Wait for either success message or form reset
    await page.waitForTimeout(3000);

    // Check for any success indicator (message appears or content field clears)
    const successMessage = page
      .getByText(/submitted|posted|success|pending|moderation/i)
      .first();
    const successExists = await successMessage.isVisible().catch(() => false);
    const contentCleared = (await commentInput.inputValue()) === "";

    // Either show success message or form was reset (content cleared)
    expect(successExists || contentCleared).toBeTruthy();
  });

  test("should display comments section container", async ({ page }) => {
    await goToFirstReview(page);

    // Scroll down to ensure page loads fully
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // The page should load completely without errors
    // Check that we can see the comment form as confirmation
    const nameInput = page.getByPlaceholder("Your name");
    await expect(nameInput).toBeVisible();
  });
});
