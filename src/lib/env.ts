import { z } from "zod";

/**
 * Pool variables already reported as invalid in this process.
 *
 * The schema is parsed once per process by `validateEnv`, but it is also parsed
 * directly by tests; keying the warning keeps an operator from hearing the same
 * complaint on every render of a settings page.
 */
const reportedInvalidPoolSetting = new Set<string>();

/**
 * A whole-number pool setting that falls back to its default instead of failing
 * the boot (`NFR-5`).
 *
 * The pool is a tuning knob on a resource that works without it, so a value the
 * operator mistyped must not take the process down — `TRANSLATION_CHAR_BUDGET`
 * below explains why an empty string is treated as unset, and this goes one step
 * further: a non-numeric or out-of-range value is reported once and replaced by
 * the documented default.
 */
function poolSetting(name: string, fallback: number, minimum: number) {
	return z.preprocess((value) => {
		if (value === undefined || value === "") {
			return fallback;
		}

		const parsed = Number(value);

		if (Number.isInteger(parsed) && parsed >= minimum) {
			return parsed;
		}

		if (!reportedInvalidPoolSetting.has(name)) {
			reportedInvalidPoolSetting.add(name);
			console.warn(
				`⚠️  ${name}="${String(value)}" is not a whole number of at least ${minimum}; using ${fallback}.`,
			);
		}

		return fallback;
	}, z.number().int().min(minimum).default(fallback));
}

/**
 * Environment variable validation schema.
 * Validates required variables at startup and provides typed access.
 *
 * Usage: import { env } from "@/lib/env"
 * Then use env.DATABASE_URI instead of process.env.DATABASE_URI
 */
const envSchema = z.object({
	// Database (required)
	DATABASE_URI: z.string().url("DATABASE_URI must be a valid PostgreSQL URL"),
	PAYLOAD_SECRET: z
		.string()
		.min(32, "PAYLOAD_SECRET must be at least 32 characters for security"),

	// Postgres connection pool (optional - defaults are the values the pool was
	// hard-coded with before they became configurable).
	//
	// Every app instance opens its own pool, so the ceiling that matters is
	// `DB_POOL_MAX` multiplied by the number of containers: keep the product
	// below the database's own `max_connections` (~100 by default), or writes
	// start waiting on connections the server will not hand out.
	DB_POOL_MAX: poolSetting("DB_POOL_MAX", 10, 1),
	DB_POOL_MIN: poolSetting("DB_POOL_MIN", 2, 0),
	DB_POOL_CONNECT_TIMEOUT_MS: poolSetting(
		"DB_POOL_CONNECT_TIMEOUT_MS",
		10000,
		1,
	),
	// How long a pooled read may wait before it is worth a warning. The
	// revalidation tail no longer reads inside the write's transaction, so a read
	// that takes this long is the first visible symptom of a starved pool.
	DB_POOL_SLOW_ACQUIRE_MS: poolSetting("DB_POOL_SLOW_ACQUIRE_MS", 1000, 1),

	// R2 Storage (required for media uploads)
	R2_BUCKET: z.string().min(1, "R2_BUCKET is required"),
	R2_ENDPOINT: z.string().url("R2_ENDPOINT must be a valid URL"),
	R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
	R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
	R2_PUBLIC_URL: z.string().url().optional(),

	// Storage adapter (optional - defaults to object storage)
	//
	// "s3" registers the R2 plugin, "local" falls back to Payload's own disk
	// storage. The e2e run uses "local": it writes its fixture media to disk
	// instead of talking to object storage.
	STORAGE_ADAPTER: z.enum(["s3", "local"]).default("s3"),

	// Site URL (optional - has fallback defaults)
	NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
	NEXT_PUBLIC_APP_URL: z.string().url().optional(),

	// Google Cloud Translation (optional - graceful degradation if missing)
	GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
	GOOGLE_CLOUD_CREDENTIALS: z.string().optional(),
	GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

	// Redis (optional - graceful degradation if missing)
	REDIS_URL: z.string().optional(),

	// Rolling translation character budget: characters allowed per 100-second
	// window. Google Cloud Translation v2 defaults to 100,000 per user and
	// allows up to 10,000,000; raising the console quota means raising this
	// value to match, or pacing stays needlessly conservative.
	//
	// An empty string is treated as unset. Container env-var UIs commonly leave
	// an optional key defined with no value, and `z.coerce.number()` turns ""
	// into 0 — which `.positive()` then rejects, crashing the process at boot
	// over a tuning knob that has a perfectly good default.
	TRANSLATION_CHAR_BUDGET: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z.coerce
			.number()
			.int("TRANSLATION_CHAR_BUDGET must be a whole number of characters")
			.positive("TRANSLATION_CHAR_BUDGET must be greater than zero")
			.default(100000),
	),
});

/**
 * Validated environment variables.
 * Throws a descriptive error at startup if required vars are missing.
 */
function validateEnv() {
	const result = envSchema.safeParse(process.env);

	if (!result.success) {
		console.error("❌ Invalid environment variables:");
		result.error.issues.forEach((issue) => {
			console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
		});
		throw new Error(
			"Missing or invalid environment variables. Check logs above.",
		);
	}

	return result.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;

/**
 * The raw schema, exported for tests only.
 *
 * `env` is validated once at module load against the real `process.env`, so a
 * test cannot vary an input by mutating the environment afterwards. Exposing
 * the schema lets a test parse a synthetic environment and assert the
 * coercion and defaulting rules directly.
 */
export const envSchemaForTest = envSchema;
