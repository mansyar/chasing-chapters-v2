import { describe, expect, it } from "bun:test";
import { envSchemaForTest } from "../env";

/**
 * Coercion and defaulting rules for the rolling translation character budget.
 *
 * `env` itself is validated once at module load against the real process
 * environment, so these cases parse the schema directly rather than mutating
 * `process.env` after the fact.
 */
const REQUIRED = {
	DATABASE_URI: "postgresql://user:pass@localhost:5432/db",
	PAYLOAD_SECRET: "a".repeat(32),
	R2_BUCKET: "bucket",
	R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
	R2_ACCESS_KEY_ID: "key",
	R2_SECRET_ACCESS_KEY: "secret",
};

function parseBudget(value: string | undefined) {
	const input =
		value === undefined
			? { ...REQUIRED }
			: { ...REQUIRED, TRANSLATION_CHAR_BUDGET: value };
	return envSchemaForTest.safeParse(input);
}

describe("TRANSLATION_CHAR_BUDGET", () => {
	it("defaults to 100,000 when the variable is absent", () => {
		const result = parseBudget(undefined);
		expect(result.success).toBe(true);
		expect(result.success && result.data.TRANSLATION_CHAR_BUDGET).toBe(100_000);
	});

	// Container env-var UIs commonly leave an optional key defined with an empty
	// value. Before the preprocess step, "" coerced to 0, `.positive()` rejected
	// it, and the process crashed at boot over a knob with a good default.
	it("falls back to the default when the variable is set but empty", () => {
		const result = parseBudget("");
		expect(result.success).toBe(true);
		expect(result.success && result.data.TRANSLATION_CHAR_BUDGET).toBe(100_000);
	});

	it("accepts a raised limit as a string, the shape an env var arrives in", () => {
		const result = parseBudget("10000000");
		expect(result.success).toBe(true);
		expect(result.success && result.data.TRANSLATION_CHAR_BUDGET).toBe(
			10_000_000,
		);
	});

	it("rejects zero, a negative number, and a fraction", () => {
		expect(parseBudget("0").success).toBe(false);
		expect(parseBudget("-1").success).toBe(false);
		expect(parseBudget("1.5").success).toBe(false);
	});

	it("rejects a non-numeric value", () => {
		expect(parseBudget("lots").success).toBe(false);
	});
});
