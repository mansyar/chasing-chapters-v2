import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The localized names are optional in a non-default locale: an author who only
// fills in the Indonesian description of a tag writes no Indonesian name, and
// the column has to accept that so the read falls back to the English name
// (FR-10). `genres_locales`, `tags_locales` and `mood_tags_locales` were created
// `NOT NULL` because the field was `required`; the requirement now lives in
// `requireDefaultLocaleValue`, which enforces it in the default locale only.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "genres_locales" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "tags_locales" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "mood_tags_locales" ALTER COLUMN "name" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "genres_locales" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "tags_locales" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "mood_tags_locales" ALTER COLUMN "name" SET NOT NULL;`)
}
