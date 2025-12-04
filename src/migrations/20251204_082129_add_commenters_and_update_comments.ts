import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_authors_role" AS ENUM('admin', 'writer');
  CREATE TYPE "public"."enum_reviews_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__reviews_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_reading_lists_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__reading_lists_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_comments_status" AS ENUM('pending', 'approved', 'rejected', 'reported');
  CREATE TABLE "authors_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"avatar_id" integer,
  	"bio" varchar,
  	"role" "enum_authors_role" DEFAULT 'writer' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_feature_url" varchar,
  	"sizes_feature_width" numeric,
  	"sizes_feature_height" numeric,
  	"sizes_feature_mime_type" varchar,
  	"sizes_feature_filesize" numeric,
  	"sizes_feature_filename" varchar
  );
  
  CREATE TABLE "genres" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mood_tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"color" varchar NOT NULL,
  	"icon" varchar,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reviews_favorite_quotes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"page" varchar
  );
  
  CREATE TABLE "reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"book_author" varchar,
  	"rating" numeric,
  	"cover_image_id" integer,
  	"review_content" jsonb,
  	"what_i_loved" jsonb,
  	"what_could_be_better" jsonb,
  	"perfect_for" jsonb,
  	"reading_start_date" timestamp(3) with time zone,
  	"reading_finish_date" timestamp(3) with time zone,
  	"featured" boolean DEFAULT false,
  	"likes" numeric DEFAULT 0,
  	"publish_date" timestamp(3) with time zone,
  	"author_id" integer,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_reviews_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "reviews_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"genres_id" integer,
  	"tags_id" integer,
  	"mood_tags_id" integer,
  	"reviews_id" integer
  );
  
  CREATE TABLE "_reviews_v_version_favorite_quotes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"page" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_reviews_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_book_author" varchar,
  	"version_rating" numeric,
  	"version_cover_image_id" integer,
  	"version_review_content" jsonb,
  	"version_what_i_loved" jsonb,
  	"version_what_could_be_better" jsonb,
  	"version_perfect_for" jsonb,
  	"version_reading_start_date" timestamp(3) with time zone,
  	"version_reading_finish_date" timestamp(3) with time zone,
  	"version_featured" boolean DEFAULT false,
  	"version_likes" numeric DEFAULT 0,
  	"version_publish_date" timestamp(3) with time zone,
  	"version_author_id" integer,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__reviews_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_reviews_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"genres_id" integer,
  	"tags_id" integer,
  	"mood_tags_id" integer,
  	"reviews_id" integer
  );
  
  CREATE TABLE "reading_lists" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"author_id" integer,
  	"cover_image_id" integer,
  	"featured" boolean DEFAULT false,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_reading_lists_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "reading_lists_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"reviews_id" integer
  );
  
  CREATE TABLE "_reading_lists_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_description" varchar,
  	"version_author_id" integer,
  	"version_cover_image_id" integer,
  	"version_featured" boolean DEFAULT false,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__reading_lists_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_reading_lists_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"reviews_id" integer
  );
  
  CREATE TABLE "comments_reported_by" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"email" varchar,
  	"reported_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"author_name" varchar NOT NULL,
  	"content" varchar NOT NULL,
  	"related_review_id" integer NOT NULL,
  	"commenter_id" integer NOT NULL,
  	"status" "enum_comments_status" DEFAULT 'pending' NOT NULL,
  	"report_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "commenters" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"approved_comment_count" numeric DEFAULT 0,
  	"trusted" boolean DEFAULT false,
  	"banned" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer,
  	"media_id" integer,
  	"genres_id" integer,
  	"tags_id" integer,
  	"mood_tags_id" integer,
  	"reviews_id" integer,
  	"reading_lists_id" integer,
  	"comments_id" integer,
  	"commenters_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "authors_sessions" ADD CONSTRAINT "authors_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews_favorite_quotes" ADD CONSTRAINT "reviews_favorite_quotes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_genres_fk" FOREIGN KEY ("genres_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_mood_tags_fk" FOREIGN KEY ("mood_tags_id") REFERENCES "public"."mood_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reviews_v_version_favorite_quotes" ADD CONSTRAINT "_reviews_v_version_favorite_quotes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_reviews_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reviews_v" ADD CONSTRAINT "_reviews_v_parent_id_reviews_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reviews_v" ADD CONSTRAINT "_reviews_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reviews_v" ADD CONSTRAINT "_reviews_v_version_author_id_authors_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reviews_v_rels" ADD CONSTRAINT "_reviews_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_reviews_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reviews_v_rels" ADD CONSTRAINT "_reviews_v_rels_genres_fk" FOREIGN KEY ("genres_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reviews_v_rels" ADD CONSTRAINT "_reviews_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reviews_v_rels" ADD CONSTRAINT "_reviews_v_rels_mood_tags_fk" FOREIGN KEY ("mood_tags_id") REFERENCES "public"."mood_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reviews_v_rels" ADD CONSTRAINT "_reviews_v_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reading_lists" ADD CONSTRAINT "reading_lists_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reading_lists" ADD CONSTRAINT "reading_lists_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reading_lists_rels" ADD CONSTRAINT "reading_lists_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reading_lists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reading_lists_rels" ADD CONSTRAINT "reading_lists_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reading_lists_v" ADD CONSTRAINT "_reading_lists_v_parent_id_reading_lists_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reading_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reading_lists_v" ADD CONSTRAINT "_reading_lists_v_version_author_id_authors_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reading_lists_v" ADD CONSTRAINT "_reading_lists_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reading_lists_v_rels" ADD CONSTRAINT "_reading_lists_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_reading_lists_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reading_lists_v_rels" ADD CONSTRAINT "_reading_lists_v_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments_reported_by" ADD CONSTRAINT "comments_reported_by_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_related_review_id_reviews_id_fk" FOREIGN KEY ("related_review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_commenter_id_commenters_id_fk" FOREIGN KEY ("commenter_id") REFERENCES "public"."commenters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_genres_fk" FOREIGN KEY ("genres_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mood_tags_fk" FOREIGN KEY ("mood_tags_id") REFERENCES "public"."mood_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reading_lists_fk" FOREIGN KEY ("reading_lists_id") REFERENCES "public"."reading_lists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_commenters_fk" FOREIGN KEY ("commenters_id") REFERENCES "public"."commenters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "authors_sessions_order_idx" ON "authors_sessions" USING btree ("_order");
  CREATE INDEX "authors_sessions_parent_id_idx" ON "authors_sessions" USING btree ("_parent_id");
  CREATE INDEX "authors_avatar_idx" ON "authors" USING btree ("avatar_id");
  CREATE INDEX "authors_updated_at_idx" ON "authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "authors" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_email_idx" ON "authors" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_feature_sizes_feature_filename_idx" ON "media" USING btree ("sizes_feature_filename");
  CREATE INDEX "genres_updated_at_idx" ON "genres" USING btree ("updated_at");
  CREATE INDEX "genres_created_at_idx" ON "genres" USING btree ("created_at");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE INDEX "mood_tags_updated_at_idx" ON "mood_tags" USING btree ("updated_at");
  CREATE INDEX "mood_tags_created_at_idx" ON "mood_tags" USING btree ("created_at");
  CREATE INDEX "reviews_favorite_quotes_order_idx" ON "reviews_favorite_quotes" USING btree ("_order");
  CREATE INDEX "reviews_favorite_quotes_parent_id_idx" ON "reviews_favorite_quotes" USING btree ("_parent_id");
  CREATE INDEX "reviews_cover_image_idx" ON "reviews" USING btree ("cover_image_id");
  CREATE INDEX "reviews_author_idx" ON "reviews" USING btree ("author_id");
  CREATE INDEX "reviews_updated_at_idx" ON "reviews" USING btree ("updated_at");
  CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");
  CREATE INDEX "reviews__status_idx" ON "reviews" USING btree ("_status");
  CREATE INDEX "reviews_rels_order_idx" ON "reviews_rels" USING btree ("order");
  CREATE INDEX "reviews_rels_parent_idx" ON "reviews_rels" USING btree ("parent_id");
  CREATE INDEX "reviews_rels_path_idx" ON "reviews_rels" USING btree ("path");
  CREATE INDEX "reviews_rels_genres_id_idx" ON "reviews_rels" USING btree ("genres_id");
  CREATE INDEX "reviews_rels_tags_id_idx" ON "reviews_rels" USING btree ("tags_id");
  CREATE INDEX "reviews_rels_mood_tags_id_idx" ON "reviews_rels" USING btree ("mood_tags_id");
  CREATE INDEX "reviews_rels_reviews_id_idx" ON "reviews_rels" USING btree ("reviews_id");
  CREATE INDEX "_reviews_v_version_favorite_quotes_order_idx" ON "_reviews_v_version_favorite_quotes" USING btree ("_order");
  CREATE INDEX "_reviews_v_version_favorite_quotes_parent_id_idx" ON "_reviews_v_version_favorite_quotes" USING btree ("_parent_id");
  CREATE INDEX "_reviews_v_parent_idx" ON "_reviews_v" USING btree ("parent_id");
  CREATE INDEX "_reviews_v_version_version_cover_image_idx" ON "_reviews_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_reviews_v_version_version_author_idx" ON "_reviews_v" USING btree ("version_author_id");
  CREATE INDEX "_reviews_v_version_version_updated_at_idx" ON "_reviews_v" USING btree ("version_updated_at");
  CREATE INDEX "_reviews_v_version_version_created_at_idx" ON "_reviews_v" USING btree ("version_created_at");
  CREATE INDEX "_reviews_v_version_version__status_idx" ON "_reviews_v" USING btree ("version__status");
  CREATE INDEX "_reviews_v_created_at_idx" ON "_reviews_v" USING btree ("created_at");
  CREATE INDEX "_reviews_v_updated_at_idx" ON "_reviews_v" USING btree ("updated_at");
  CREATE INDEX "_reviews_v_latest_idx" ON "_reviews_v" USING btree ("latest");
  CREATE INDEX "_reviews_v_rels_order_idx" ON "_reviews_v_rels" USING btree ("order");
  CREATE INDEX "_reviews_v_rels_parent_idx" ON "_reviews_v_rels" USING btree ("parent_id");
  CREATE INDEX "_reviews_v_rels_path_idx" ON "_reviews_v_rels" USING btree ("path");
  CREATE INDEX "_reviews_v_rels_genres_id_idx" ON "_reviews_v_rels" USING btree ("genres_id");
  CREATE INDEX "_reviews_v_rels_tags_id_idx" ON "_reviews_v_rels" USING btree ("tags_id");
  CREATE INDEX "_reviews_v_rels_mood_tags_id_idx" ON "_reviews_v_rels" USING btree ("mood_tags_id");
  CREATE INDEX "_reviews_v_rels_reviews_id_idx" ON "_reviews_v_rels" USING btree ("reviews_id");
  CREATE INDEX "reading_lists_author_idx" ON "reading_lists" USING btree ("author_id");
  CREATE INDEX "reading_lists_cover_image_idx" ON "reading_lists" USING btree ("cover_image_id");
  CREATE INDEX "reading_lists_updated_at_idx" ON "reading_lists" USING btree ("updated_at");
  CREATE INDEX "reading_lists_created_at_idx" ON "reading_lists" USING btree ("created_at");
  CREATE INDEX "reading_lists__status_idx" ON "reading_lists" USING btree ("_status");
  CREATE INDEX "reading_lists_rels_order_idx" ON "reading_lists_rels" USING btree ("order");
  CREATE INDEX "reading_lists_rels_parent_idx" ON "reading_lists_rels" USING btree ("parent_id");
  CREATE INDEX "reading_lists_rels_path_idx" ON "reading_lists_rels" USING btree ("path");
  CREATE INDEX "reading_lists_rels_reviews_id_idx" ON "reading_lists_rels" USING btree ("reviews_id");
  CREATE INDEX "_reading_lists_v_parent_idx" ON "_reading_lists_v" USING btree ("parent_id");
  CREATE INDEX "_reading_lists_v_version_version_author_idx" ON "_reading_lists_v" USING btree ("version_author_id");
  CREATE INDEX "_reading_lists_v_version_version_cover_image_idx" ON "_reading_lists_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_reading_lists_v_version_version_updated_at_idx" ON "_reading_lists_v" USING btree ("version_updated_at");
  CREATE INDEX "_reading_lists_v_version_version_created_at_idx" ON "_reading_lists_v" USING btree ("version_created_at");
  CREATE INDEX "_reading_lists_v_version_version__status_idx" ON "_reading_lists_v" USING btree ("version__status");
  CREATE INDEX "_reading_lists_v_created_at_idx" ON "_reading_lists_v" USING btree ("created_at");
  CREATE INDEX "_reading_lists_v_updated_at_idx" ON "_reading_lists_v" USING btree ("updated_at");
  CREATE INDEX "_reading_lists_v_latest_idx" ON "_reading_lists_v" USING btree ("latest");
  CREATE INDEX "_reading_lists_v_rels_order_idx" ON "_reading_lists_v_rels" USING btree ("order");
  CREATE INDEX "_reading_lists_v_rels_parent_idx" ON "_reading_lists_v_rels" USING btree ("parent_id");
  CREATE INDEX "_reading_lists_v_rels_path_idx" ON "_reading_lists_v_rels" USING btree ("path");
  CREATE INDEX "_reading_lists_v_rels_reviews_id_idx" ON "_reading_lists_v_rels" USING btree ("reviews_id");
  CREATE INDEX "comments_reported_by_order_idx" ON "comments_reported_by" USING btree ("_order");
  CREATE INDEX "comments_reported_by_parent_id_idx" ON "comments_reported_by" USING btree ("_parent_id");
  CREATE INDEX "comments_related_review_idx" ON "comments" USING btree ("related_review_id");
  CREATE INDEX "comments_commenter_idx" ON "comments" USING btree ("commenter_id");
  CREATE INDEX "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");
  CREATE UNIQUE INDEX "commenters_email_idx" ON "commenters" USING btree ("email");
  CREATE INDEX "commenters_updated_at_idx" ON "commenters" USING btree ("updated_at");
  CREATE INDEX "commenters_created_at_idx" ON "commenters" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_genres_id_idx" ON "payload_locked_documents_rels" USING btree ("genres_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_mood_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("mood_tags_id");
  CREATE INDEX "payload_locked_documents_rels_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("reviews_id");
  CREATE INDEX "payload_locked_documents_rels_reading_lists_id_idx" ON "payload_locked_documents_rels" USING btree ("reading_lists_id");
  CREATE INDEX "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX "payload_locked_documents_rels_commenters_id_idx" ON "payload_locked_documents_rels" USING btree ("commenters_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_authors_id_idx" ON "payload_preferences_rels" USING btree ("authors_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "authors_sessions" CASCADE;
  DROP TABLE "authors" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "genres" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "mood_tags" CASCADE;
  DROP TABLE "reviews_favorite_quotes" CASCADE;
  DROP TABLE "reviews" CASCADE;
  DROP TABLE "reviews_rels" CASCADE;
  DROP TABLE "_reviews_v_version_favorite_quotes" CASCADE;
  DROP TABLE "_reviews_v" CASCADE;
  DROP TABLE "_reviews_v_rels" CASCADE;
  DROP TABLE "reading_lists" CASCADE;
  DROP TABLE "reading_lists_rels" CASCADE;
  DROP TABLE "_reading_lists_v" CASCADE;
  DROP TABLE "_reading_lists_v_rels" CASCADE;
  DROP TABLE "comments_reported_by" CASCADE;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "commenters" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_authors_role";
  DROP TYPE "public"."enum_reviews_status";
  DROP TYPE "public"."enum__reviews_v_version_status";
  DROP TYPE "public"."enum_reading_lists_status";
  DROP TYPE "public"."enum__reading_lists_v_version_status";
  DROP TYPE "public"."enum_comments_status";`)
}
