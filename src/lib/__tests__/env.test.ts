import { describe, expect, it, spyOn } from "bun:test";
import { envSchemaForTest } from "../env";

/**
 * Coercion and defaulting rules for the rolling translation character budget and
 * the Postgres pool settings.
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

/** The four pool settings and the default each one must fall back to. */
const POOL_DEFAULTS = {
	DB_POOL_MAX: 10,
	DB_POOL_MIN: 2,
	DB_POOL_CONNECT_TIMEOUT_MS: 10_000,
	DB_POOL_SLOW_ACQUIRE_MS: 1_000,
} as const;

describe("Postgres pool settings", () => {
	it("defaults to the values the pool was hard-coded with", () => {
		const result = envSchemaForTest.safeParse({ ...REQUIRED });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.DB_POOL_MAX).toBe(10);
			expect(result.data.DB_POOL_MIN).toBe(2);
			expect(result.data.DB_POOL_CONNECT_TIMEOUT_MS).toBe(10_000);
			expect(result.data.DB_POOL_SLOW_ACQUIRE_MS).toBe(1_000);
		}
	});

	it("accepts overrides in the string shape an environment variable arrives in", () => {
		const result = envSchemaForTest.safeParse({
			...REQUIRED,
			DB_POOL_MAX: "20",
			DB_POOL_MIN: "0",
			DB_POOL_CONNECT_TIMEOUT_MS: "3000",
			DB_POOL_SLOW_ACQUIRE_MS: "250",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.DB_POOL_MAX).toBe(20);
			// Zero is a legitimate minimum: it lets the pool drain when idle.
			expect(result.data.DB_POOL_MIN).toBe(0);
			expect(result.data.DB_POOL_CONNECT_TIMEOUT_MS).toBe(3_000);
			expect(result.data.DB_POOL_SLOW_ACQUIRE_MS).toBe(250);
		}
	});

	// A mistyped pool setting must not crash the boot (`NFR-5`): it is a tuning
	// knob with a working default, so it is reported once and replaced.
	it("falls back to the default and warns once per setting when a value is invalid", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});

		try {
			const result = envSchemaForTest.safeParse({
				...REQUIRED,
				DB_POOL_MAX: "lots",
				DB_POOL_MIN: "-1",
				DB_POOL_CONNECT_TIMEOUT_MS: "1.5",
				DB_POOL_SLOW_ACQUIRE_MS: "0",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.DB_POOL_MAX).toBe(POOL_DEFAULTS.DB_POOL_MAX);
				expect(result.data.DB_POOL_MIN).toBe(POOL_DEFAULTS.DB_POOL_MIN);
				expect(result.data.DB_POOL_CONNECT_TIMEOUT_MS).toBe(
					POOL_DEFAULTS.DB_POOL_CONNECT_TIMEOUT_MS,
				);
				expect(result.data.DB_POOL_SLOW_ACQUIRE_MS).toBe(
					POOL_DEFAULTS.DB_POOL_SLOW_ACQUIRE_MS,
				);
			}

			expect(warn).toHaveBeenCalledTimes(4);

			// The same setting misconfigured again is not worth a second line.
			envSchemaForTest.safeParse({ ...REQUIRED, DB_POOL_MAX: "0" });
			expect(warn).toHaveBeenCalledTimes(4);
		} finally {
			warn.mockRestore();
		}
	});

	// Container env-var UIs commonly leave an optional key defined with no value.
	// That is "unset", not "invalid", so it must not produce a warning.
	it("falls back silently when a setting is defined but empty", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});

		try {
			const result = envSchemaForTest.safeParse({
				...REQUIRED,
				DB_POOL_MAX: "",
				DB_POOL_MIN: "",
				DB_POOL_CONNECT_TIMEOUT_MS: "",
				DB_POOL_SLOW_ACQUIRE_MS: "",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.DB_POOL_MAX).toBe(POOL_DEFAULTS.DB_POOL_MAX);
				expect(result.data.DB_POOL_MIN).toBe(POOL_DEFAULTS.DB_POOL_MIN);
				expect(result.data.DB_POOL_CONNECT_TIMEOUT_MS).toBe(
					POOL_DEFAULTS.DB_POOL_CONNECT_TIMEOUT_MS,
				);
				expect(result.data.DB_POOL_SLOW_ACQUIRE_MS).toBe(
					POOL_DEFAULTS.DB_POOL_SLOW_ACQUIRE_MS,
				);
			}

			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
});
