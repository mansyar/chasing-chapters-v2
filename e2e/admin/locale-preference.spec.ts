import { expect, test } from "@playwright/test";
import {
	deleteLocalePreference,
	getLocalePreference,
	loginAsFixtureAdmin,
} from "../fixtures/admin-session";

test.describe("Admin locale preference", () => {
	// Two logins and a preference write: the admin panel is slow to warm up.
	test.setTimeout(60_000);

	test("stores the locale preference when the admin logs in", async ({
		page,
	}) => {
		// A session is needed to remove the preference: the admin's own
		// session is the only one allowed to touch it.
		await loginAsFixtureAdmin(page);
		await deleteLocalePreference(page);

		// Drop the session, so the login below is a real one. The login is
		// what has to store the preference.
		await page.context().clearCookies();
		await loginAsFixtureAdmin(page);

		// The preference is readable through the preferences endpoint of the
		// collection, and it carries the default locale.
		const preference = await getLocalePreference(page);
		expect(preference.key).toBe("locale");
		expect(preference.value).toBe("en");
	});
});
