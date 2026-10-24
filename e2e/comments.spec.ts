import { expect, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEW_PATH } from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

const FIXTURE_REVIEW_URL = localePath(E2E_FIXTURE_REVIEW_PATH);

test.describe("Comments", () => {
	// Run serially in one worker: parallel workers all submit comments from
	// localhost and exhaust the shared per-IP rate-limit bucket
	// (rateLimit(key, 5, 60)), making "should submit comment successfully"
	// flake under full-suite parallelism.
	test.describe.configure({ mode: "serial" });

	// Every test opens the review the fixture seeds, so the comment form is
	// always the one of a known review.
	test.beforeEach(async ({ page }) => {
		await page.goto(FIXTURE_REVIEW_URL);
	});

	test("should display comment form", async ({ page }) => {
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
		// Click submit without filling form
		const submitButton = page.getByRole("button", { name: /Submit Comment/i });
		await submitButton.click();

		// Should show error message or HTML5 validation
		const nameInput = page.getByPlaceholder("Your name");
		const isInvalid = await nameInput.evaluate(
			(el) => (el as HTMLInputElement).validity?.valueMissing,
		);

		// Either browser validation or custom error message
		expect(isInvalid).toBeTruthy();
	});

	test("should submit comment successfully", async ({ page }) => {
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

		// Wait for submission to complete - button should re-enable when done
		await expect(submitButton).toBeEnabled({ timeout: 15000 });

		// The action answers with "Your comment has been posted!" (approved) or
		// "Your comment has been submitted and is pending moderation..."
		await expect(page.getByText(/your comment has been/i).first()).toBeVisible({
			timeout: 15000,
		});
	});

	test("should display comments section container", async ({ page }) => {
		// Scroll down to ensure page loads fully
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

		// The page should load completely without errors
		// Check that we can see the comment form as confirmation
		const nameInput = page.getByPlaceholder("Your name");
		await expect(nameInput).toBeVisible();
	});
});
