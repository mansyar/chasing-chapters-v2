import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_reviews_translation_status" AS ENUM('untranslated', 'pending', 'translated', 'failed', 'stale');
  CREATE TYPE "public"."enum__reviews_v_version_translation_status" AS ENUM('untranslated', 'pending', 'translated', 'failed', 'stale');
  ALTER TABLE "reviews" ADD COLUMN "auto_translate" boolean DEFAULT true;
  ALTER TABLE "reviews" ADD COLUMN "translation_status" "enum_reviews_translation_status" DEFAULT 'untranslated';
  ALTER TABLE "reviews" ADD COLUMN "translation_error" varchar;
  ALTER TABLE "reviews" ADD COLUMN "translation_updated_at" timestamp(3) with time zone;
  ALTER TABLE "_reviews_v" ADD COLUMN "version_auto_translate" boolean DEFAULT true;
  ALTER TABLE "_reviews_v" ADD COLUMN "version_translation_status" "enum__reviews_v_version_translation_status" DEFAULT 'untranslated';
  ALTER TABLE "_reviews_v" ADD COLUMN "version_translation_error" varchar;
  ALTER TABLE "_reviews_v" ADD COLUMN "version_translation_updated_at" timestamp(3) with time zone;`)

  // Backfill: reviews whose Indonesian locale already carries translated
  // richText are marked 'translated'; everything else keeps the default
  // 'untranslated'.
  await db.execute(sql`
   UPDATE "reviews" SET "translation_status" = 'translated'
   WHERE EXISTS (
     SELECT 1 FROM "reviews_locales" rl
     WHERE rl."_parent_id" = "reviews"."id"
       AND rl."_locale" = 'id'
       AND rl."review_content" IS NOT NULL
   );`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reviews" DROP COLUMN "auto_translate";
  ALTER TABLE "reviews" DROP COLUMN "translation_status";
  ALTER TABLE "reviews" DROP COLUMN "translation_error";
  ALTER TABLE "reviews" DROP COLUMN "translation_updated_at";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_auto_translate";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_translation_status";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_translation_error";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_translation_updated_at";
  DROP TYPE "public"."enum_reviews_translation_status";
  DROP TYPE "public"."enum__reviews_v_version_translation_status";`)
}
