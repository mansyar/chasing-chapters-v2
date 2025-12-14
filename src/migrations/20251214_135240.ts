import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Step 1: Create locale enums and new tables
  await db.execute(sql`
    CREATE TYPE "public"."_locales" AS ENUM('en', 'id');
    CREATE TYPE "public"."enum__reviews_v_published_locale" AS ENUM('en', 'id');
    CREATE TYPE "public"."enum__reading_lists_v_published_locale" AS ENUM('en', 'id');
    
    CREATE TABLE "reviews_locales" (
      "review_content" jsonb,
      "what_i_loved" jsonb,
      "what_could_be_better" jsonb,
      "perfect_for" jsonb,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    
    CREATE TABLE "_reviews_v_locales" (
      "version_review_content" jsonb,
      "version_what_i_loved" jsonb,
      "version_what_could_be_better" jsonb,
      "version_perfect_for" jsonb,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
  `);

  // Step 2: Migrate existing data to English locale
  await db.execute(sql`
    INSERT INTO "reviews_locales" ("review_content", "what_i_loved", "what_could_be_better", "perfect_for", "_locale", "_parent_id")
    SELECT "review_content", "what_i_loved", "what_could_be_better", "perfect_for", 'en', "id"
    FROM "reviews"
    WHERE "review_content" IS NOT NULL;
  `);

  // Step 3: Migrate version data to English locale
  await db.execute(sql`
    INSERT INTO "_reviews_v_locales" ("version_review_content", "version_what_i_loved", "version_what_could_be_better", "version_perfect_for", "_locale", "_parent_id")
    SELECT "version_review_content", "version_what_i_loved", "version_what_could_be_better", "version_perfect_for", 'en', "id"
    FROM "_reviews_v"
    WHERE "version_review_content" IS NOT NULL;
  `);

  // Step 4: Add locale column to favorite_quotes and set default to 'en' for existing rows
  await db.execute(sql`
    ALTER TABLE "reviews_favorite_quotes" ADD COLUMN "_locale" "_locales";
    UPDATE "reviews_favorite_quotes" SET "_locale" = 'en';
    ALTER TABLE "reviews_favorite_quotes" ALTER COLUMN "_locale" SET NOT NULL;
    
    ALTER TABLE "_reviews_v_version_favorite_quotes" ADD COLUMN "_locale" "_locales";
    UPDATE "_reviews_v_version_favorite_quotes" SET "_locale" = 'en';
    ALTER TABLE "_reviews_v_version_favorite_quotes" ALTER COLUMN "_locale" SET NOT NULL;
  `);

  // Step 5: Add new columns and constraints
  await db.execute(sql`
    ALTER TABLE "_reviews_v" ADD COLUMN "snapshot" boolean;
    ALTER TABLE "_reviews_v" ADD COLUMN "published_locale" "enum__reviews_v_published_locale";
    ALTER TABLE "_reading_lists_v" ADD COLUMN "snapshot" boolean;
    ALTER TABLE "_reading_lists_v" ADD COLUMN "published_locale" "enum__reading_lists_v_published_locale";
    
    ALTER TABLE "reviews_locales" ADD CONSTRAINT "reviews_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "_reviews_v_locales" ADD CONSTRAINT "_reviews_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_reviews_v"("id") ON DELETE cascade ON UPDATE no action;
    
    CREATE UNIQUE INDEX "reviews_locales_locale_parent_id_unique" ON "reviews_locales" USING btree ("_locale","_parent_id");
    CREATE UNIQUE INDEX "_reviews_v_locales_locale_parent_id_unique" ON "_reviews_v_locales" USING btree ("_locale","_parent_id");
    CREATE INDEX "reviews_favorite_quotes_locale_idx" ON "reviews_favorite_quotes" USING btree ("_locale");
    CREATE INDEX "_reviews_v_version_favorite_quotes_locale_idx" ON "_reviews_v_version_favorite_quotes" USING btree ("_locale");
    CREATE INDEX "_reviews_v_snapshot_idx" ON "_reviews_v" USING btree ("snapshot");
    CREATE INDEX "_reviews_v_published_locale_idx" ON "_reviews_v" USING btree ("published_locale");
    CREATE INDEX "_reading_lists_v_snapshot_idx" ON "_reading_lists_v" USING btree ("snapshot");
    CREATE INDEX "_reading_lists_v_published_locale_idx" ON "_reading_lists_v" USING btree ("published_locale");
  `);

  // Step 6: Drop old columns (data is now safely in locales tables)
  await db.execute(sql`
    ALTER TABLE "reviews" DROP COLUMN "review_content";
    ALTER TABLE "reviews" DROP COLUMN "what_i_loved";
    ALTER TABLE "reviews" DROP COLUMN "what_could_be_better";
    ALTER TABLE "reviews" DROP COLUMN "perfect_for";
    ALTER TABLE "_reviews_v" DROP COLUMN "version_review_content";
    ALTER TABLE "_reviews_v" DROP COLUMN "version_what_i_loved";
    ALTER TABLE "_reviews_v" DROP COLUMN "version_what_could_be_better";
    ALTER TABLE "_reviews_v" DROP COLUMN "version_perfect_for";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Step 1: Add back the original columns
  await db.execute(sql`
    ALTER TABLE "reviews" ADD COLUMN "review_content" jsonb;
    ALTER TABLE "reviews" ADD COLUMN "what_i_loved" jsonb;
    ALTER TABLE "reviews" ADD COLUMN "what_could_be_better" jsonb;
    ALTER TABLE "reviews" ADD COLUMN "perfect_for" jsonb;
    ALTER TABLE "_reviews_v" ADD COLUMN "version_review_content" jsonb;
    ALTER TABLE "_reviews_v" ADD COLUMN "version_what_i_loved" jsonb;
    ALTER TABLE "_reviews_v" ADD COLUMN "version_what_could_be_better" jsonb;
    ALTER TABLE "_reviews_v" ADD COLUMN "version_perfect_for" jsonb;
  `);

  // Step 2: Restore data from English locale back to original columns
  await db.execute(sql`
    UPDATE "reviews" r
    SET 
      "review_content" = rl."review_content",
      "what_i_loved" = rl."what_i_loved",
      "what_could_be_better" = rl."what_could_be_better",
      "perfect_for" = rl."perfect_for"
    FROM "reviews_locales" rl
    WHERE r."id" = rl."_parent_id" AND rl."_locale" = 'en';
  `);

  await db.execute(sql`
    UPDATE "_reviews_v" rv
    SET 
      "version_review_content" = rvl."version_review_content",
      "version_what_i_loved" = rvl."version_what_i_loved",
      "version_what_could_be_better" = rvl."version_what_could_be_better",
      "version_perfect_for" = rvl."version_perfect_for"
    FROM "_reviews_v_locales" rvl
    WHERE rv."id" = rvl."_parent_id" AND rvl."_locale" = 'en';
  `);

  // Step 3: Drop locales tables and cleanup
  await db.execute(sql`
    ALTER TABLE "reviews_locales" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE "_reviews_v_locales" DISABLE ROW LEVEL SECURITY;
    DROP TABLE "reviews_locales" CASCADE;
    DROP TABLE "_reviews_v_locales" CASCADE;
    
    DROP INDEX "reviews_favorite_quotes_locale_idx";
    DROP INDEX "_reviews_v_version_favorite_quotes_locale_idx";
    DROP INDEX "_reviews_v_snapshot_idx";
    DROP INDEX "_reviews_v_published_locale_idx";
    DROP INDEX "_reading_lists_v_snapshot_idx";
    DROP INDEX "_reading_lists_v_published_locale_idx";
    
    ALTER TABLE "reviews_favorite_quotes" DROP COLUMN "_locale";
    ALTER TABLE "_reviews_v_version_favorite_quotes" DROP COLUMN "_locale";
    ALTER TABLE "_reviews_v" DROP COLUMN "snapshot";
    ALTER TABLE "_reviews_v" DROP COLUMN "published_locale";
    ALTER TABLE "_reading_lists_v" DROP COLUMN "snapshot";
    ALTER TABLE "_reading_lists_v" DROP COLUMN "published_locale";
    
    DROP TYPE "public"."_locales";
    DROP TYPE "public"."enum__reviews_v_published_locale";
    DROP TYPE "public"."enum__reading_lists_v_published_locale";
  `);
}
