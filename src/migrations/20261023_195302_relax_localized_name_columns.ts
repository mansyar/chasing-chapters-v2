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

// Nothing to undo here, and nothing that can be undone safely.
//
// `up` only relaxed a constraint, so there is no data to move back. Restoring
// `NOT NULL` is not the reverse of that: the whole point of `up` is that a
// non-default locale may legitimately leave the name empty, so a table in the
// state `up` documents as normal holds rows that a `SET NOT NULL` rejects -
// `column "name" of relation "genres_locales" contains null values`. Payload
// wraps the migration batch in a transaction, so that failure aborts the whole
// rollback and the next step of the same batch, `20261023_193922`'s `down`,
// never runs (NFR-5).
//
// The constraint also has nothing left to protect by the time this step is
// reached: `20261023_193922`'s `down` drops the three `*_locales` tables in the
// same batch. Backfilling English names into the non-default rows would write
// translations nobody entered, so the relaxation simply stays relaxed.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // See above: relaxing a column has no data to reverse, and the constraint
  // cannot be restored without inventing translations.
}
