import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "comments_spam_signals" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"signal" varchar
  );
  
  ALTER TABLE "comments_spam_signals" ADD CONSTRAINT "comments_spam_signals_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "comments_spam_signals_order_idx" ON "comments_spam_signals" USING btree ("_order");
  CREATE INDEX "comments_spam_signals_parent_id_idx" ON "comments_spam_signals" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "comments_spam_signals" CASCADE;`)
}
