import { z } from "zod";

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

  // R2 Storage (required for media uploads)
  R2_BUCKET: z.string().min(1, "R2_BUCKET is required"),
  R2_ENDPOINT: z.string().url("R2_ENDPOINT must be a valid URL"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Site URL (optional - has fallback defaults)
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // Google Cloud Translation (optional - graceful degradation if missing)
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_CLOUD_CREDENTIALS: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // Redis (optional - graceful degradation if missing)
  REDIS_URL: z.string().optional(),
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
      "Missing or invalid environment variables. Check logs above."
    );
  }

  return result.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
