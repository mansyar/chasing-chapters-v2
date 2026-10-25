import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Makes the taxonomy names, the reading-list title and description and the
// review title localizable (FR-10).
//
// Payload generates the locale tables but not the move: the new `_locales`
// tables start empty and the generator then drops the columns that hold the
// existing English text. The INSERT/UPDATE block in the middle copies that
// text into the default (`en`) rows first, so an existing document keeps its
// English value and only gains the option of an Indonesian one (NFR-5). The
// `20251214_135240` migration does the same thing for the review body.
// destructive: drops the ten content columns the `*_locales` tables replace —
// "genres"."name", "tags"."name", "tags"."description", "mood_tags"."name",
// "reviews"."title", "_reviews_v"."version_title", "reading_lists"."title",
// "reading_lists"."description", "_reading_lists_v"."version_title" and
// "_reading_lists_v"."version_description". `up` copies each value into its
// default-locale row first, so the columns cannot come back without duplicating
// that row; `down()` restores the English rows only, and any Indonesian text
// written afterwards is not recoverable (FR-2, NFR-5).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "genres_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "tags_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "mood_tags_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "reading_lists_locales" (
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_reading_lists_v_locales" (
  	"version_title" varchar,
  	"version_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "reviews_locales" ADD COLUMN "title" varchar;
  ALTER TABLE "_reviews_v_locales" ADD COLUMN "version_title" varchar;
  ALTER TABLE "genres_locales" ADD CONSTRAINT "genres_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_locales" ADD CONSTRAINT "tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "mood_tags_locales" ADD CONSTRAINT "mood_tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."mood_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reading_lists_locales" ADD CONSTRAINT "reading_lists_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reading_lists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reading_lists_v_locales" ADD CONSTRAINT "_reading_lists_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_reading_lists_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "genres_locales_locale_parent_id_unique" ON "genres_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "tags_locales_locale_parent_id_unique" ON "tags_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "mood_tags_locales_locale_parent_id_unique" ON "mood_tags_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "reading_lists_locales_locale_parent_id_unique" ON "reading_lists_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_reading_lists_v_locales_locale_parent_id_unique" ON "_reading_lists_v_locales" USING btree ("_locale","_parent_id");`)

  // The existing English text becomes the default-locale rows. The taxonomy
  // and the reading list gain whole tables, so they are filled row by row;
  // the review title joins the locale row that already exists (the review
  // body has been localized since `20251214_135240`, so every review has one).
  await db.execute(sql`
   INSERT INTO "genres_locales" ("name", "_locale", "_parent_id")
     SELECT "name", 'en', "id" FROM "genres";
  INSERT INTO "tags_locales" ("name", "description", "_locale", "_parent_id")
     SELECT "name", "description", 'en', "id" FROM "tags";
  INSERT INTO "mood_tags_locales" ("name", "_locale", "_parent_id")
     SELECT "name", 'en', "id" FROM "mood_tags";
  INSERT INTO "reading_lists_locales" ("title", "description", "_locale", "_parent_id")
     SELECT "title", "description", 'en', "id" FROM "reading_lists";
  INSERT INTO "_reading_lists_v_locales" ("version_title", "version_description", "_locale", "_parent_id")
     SELECT "version_title", "version_description", 'en', "id" FROM "_reading_lists_v";
  UPDATE "reviews_locales" SET "title" = "reviews"."title"
     FROM "reviews"
     WHERE "reviews_locales"."_parent_id" = "reviews"."id"
       AND "reviews_locales"."_locale" = 'en';
  UPDATE "_reviews_v_locales" SET "version_title" = "_reviews_v"."version_title"
     FROM "_reviews_v"
     WHERE "_reviews_v_locales"."_parent_id" = "_reviews_v"."id"
       AND "_reviews_v_locales"."_locale" = 'en';`)

  await db.execute(sql`
   ALTER TABLE "genres" DROP COLUMN "name";
  ALTER TABLE "tags" DROP COLUMN "name";
  ALTER TABLE "tags" DROP COLUMN "description";
  ALTER TABLE "mood_tags" DROP COLUMN "name";
  ALTER TABLE "reviews" DROP COLUMN "title";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_title";
  ALTER TABLE "reading_lists" DROP COLUMN "title";
  ALTER TABLE "reading_lists" DROP COLUMN "description";
  ALTER TABLE "_reading_lists_v" DROP COLUMN "version_title";
  ALTER TABLE "_reading_lists_v" DROP COLUMN "version_description";`)
}

// The reverse of `up`, in the same order and for the same reason: add the
// columns back nullable, copy the default-locale values into them, and only
// then enforce `NOT NULL` and drop the locale tables. Adding a `NOT NULL`
// column to a table that already holds rows fails, and Payload rolls the whole
// migration back when a statement fails - so the earlier shape of this function
// could never complete on a populated database, and the text it needed was
// already gone by the time it tried (NFR-5). `20251214_135240` unwinds the
// review body the same way.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "genres" ADD COLUMN "name" varchar;
  ALTER TABLE "tags" ADD COLUMN "name" varchar;
  ALTER TABLE "tags" ADD COLUMN "description" varchar;
  ALTER TABLE "mood_tags" ADD COLUMN "name" varchar;
  ALTER TABLE "reviews" ADD COLUMN "title" varchar;
  ALTER TABLE "_reviews_v" ADD COLUMN "version_title" varchar;
  ALTER TABLE "reading_lists" ADD COLUMN "title" varchar;
  ALTER TABLE "reading_lists" ADD COLUMN "description" varchar;
  ALTER TABLE "_reading_lists_v" ADD COLUMN "version_title" varchar;
  ALTER TABLE "_reading_lists_v" ADD COLUMN "version_description" varchar;`)

  // The English values go back to the columns they came from. A document with
  // no English row of its own keeps `NULL`, which is why the three names are
  // the only columns that were `NOT NULL` before `up` and the only ones that
  // are made `NOT NULL` again below.
  await db.execute(sql`
   UPDATE "genres" g SET "name" = gl."name"
     FROM "genres_locales" gl
     WHERE g."id" = gl."_parent_id" AND gl."_locale" = 'en';
  UPDATE "tags" t SET "name" = tl."name", "description" = tl."description"
     FROM "tags_locales" tl
     WHERE t."id" = tl."_parent_id" AND tl."_locale" = 'en';
  UPDATE "mood_tags" m SET "name" = ml."name"
     FROM "mood_tags_locales" ml
     WHERE m."id" = ml."_parent_id" AND ml."_locale" = 'en';
  UPDATE "reading_lists" l SET "title" = ll."title", "description" = ll."description"
     FROM "reading_lists_locales" ll
     WHERE l."id" = ll."_parent_id" AND ll."_locale" = 'en';
  UPDATE "_reading_lists_v" v SET "version_title" = vl."version_title", "version_description" = vl."version_description"
     FROM "_reading_lists_v_locales" vl
     WHERE v."id" = vl."_parent_id" AND vl."_locale" = 'en';
  UPDATE "reviews" r SET "title" = rl."title"
     FROM "reviews_locales" rl
     WHERE r."id" = rl."_parent_id" AND rl."_locale" = 'en';
  UPDATE "_reviews_v" rv SET "version_title" = rvl."version_title"
     FROM "_reviews_v_locales" rvl
     WHERE rv."id" = rvl."_parent_id" AND rvl."_locale" = 'en';`)

  await db.execute(sql`
   ALTER TABLE "genres" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "tags" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "mood_tags" ALTER COLUMN "name" SET NOT NULL;
  DROP TABLE "genres_locales" CASCADE;
  DROP TABLE "tags_locales" CASCADE;
  DROP TABLE "mood_tags_locales" CASCADE;
  DROP TABLE "reading_lists_locales" CASCADE;
  DROP TABLE "_reading_lists_v_locales" CASCADE;
  ALTER TABLE "reviews_locales" DROP COLUMN "title";
  ALTER TABLE "_reviews_v_locales" DROP COLUMN "version_title";`)
}
