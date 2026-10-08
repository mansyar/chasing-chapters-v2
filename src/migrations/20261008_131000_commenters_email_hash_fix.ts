import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Fixes migration-chain drift for the commenters table.
 *
 * The email → email_hash change (privacy-preserving SHA-256 commenter identity)
 * was applied to production via drizzle dev-mode push, but was intentionally
 * omitted from 20251217_095543_add_blur_data_url_to_media (see its comment).
 * Fresh databases built from the migration chain therefore ended up with the
 * legacy `email` column instead of `email_hash`. This migration makes the
 * chain reproduce the production schema exactly.
 *
 * All statements are idempotent so they are safe to replay against databases
 * (like production) that already have the target schema.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "commenters" ADD COLUMN IF NOT EXISTS "email_hash" varchar NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "commenters_email_hash_idx" ON "commenters" USING btree ("email_hash" ASC NULLS LAST);
    ALTER TABLE "commenters" DROP COLUMN IF EXISTS "email";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "commenters" ADD COLUMN IF NOT EXISTS "email" varchar;
    DROP INDEX IF EXISTS "commenters_email_hash_idx";
    ALTER TABLE "commenters" DROP COLUMN IF EXISTS "email_hash";
  `);
}
