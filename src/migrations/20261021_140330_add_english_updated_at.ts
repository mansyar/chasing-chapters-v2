import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Adds the English content change time and backfills the real stale status
// from it (FR-8).
//
// Staleness compares `english_updated_at` (when the English content last
// changed) with `translation_updated_at` (when the translation was last
// written) — never the document's `updated_at`, which Payload restamps on
// every write, including the translation pipeline's own writes.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reviews" ADD COLUMN "english_updated_at" timestamp(3) with time zone;
  ALTER TABLE "_reviews_v" ADD COLUMN "version_english_updated_at" timestamp(3) with time zone;`)

  // Mark a review 'stale' only when its English content is provably newer
  // than its translation. This is a no-op on the first run: no row has an
  // `english_updated_at` yet. Legacy reviews are deliberately NOT backfilled —
  // their English change time was never recorded, so their staleness cannot
  // be established and they keep their current status.
  await db.execute(sql`
   UPDATE "reviews" SET "translation_status" = 'stale'
   WHERE "translation_status" = 'translated'
     AND "english_updated_at" IS NOT NULL
     AND "translation_updated_at" IS NOT NULL
     AND "english_updated_at" > "translation_updated_at";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The data step is not reversed: it is a no-op on the first run (no row had
  // an English change time yet), and any staleness marked afterwards is
  // re-derived by the pipeline on the next save.
  await db.execute(sql`
   ALTER TABLE "reviews" DROP COLUMN "english_updated_at";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_english_updated_at";`)
}
