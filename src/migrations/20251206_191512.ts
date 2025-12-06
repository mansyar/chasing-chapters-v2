import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reviews" ADD COLUMN "views" numeric DEFAULT 0;
  ALTER TABLE "_reviews_v" ADD COLUMN "version_views" numeric DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reviews" DROP COLUMN "views";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_views";`)
}
