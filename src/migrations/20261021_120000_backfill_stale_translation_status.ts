import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Backfill real stale status (FR-8): reviews whose status is 'translated'
// but whose English content was edited after the translation was last
// updated are marked 'stale'. Reviews in 'pending', 'failed', or
// 'untranslated' are skipped, as are rows missing either timestamp (no
// dates to compare).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "reviews" SET "translation_status" = 'stale'
   WHERE "translation_status" = 'translated'
     AND "translation_updated_at" IS NOT NULL
     AND "updated_at" > "translation_updated_at";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Approximate reversal: rows matching the same staleness predicate are
  // restored to 'translated'. Staleness created after this migration ran
  // satisfies the same predicate and is also reverted — acceptable for a
  // data backfill; the pipeline re-marks genuinely stale reviews on save.
  await db.execute(sql`
   UPDATE "reviews" SET "translation_status" = 'translated'
   WHERE "translation_status" = 'stale'
     AND "translation_updated_at" IS NOT NULL
     AND "updated_at" > "translation_updated_at";`)
}
