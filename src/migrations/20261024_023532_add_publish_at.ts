import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reviews" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "_reviews_v" ADD COLUMN "version_publish_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reviews" DROP COLUMN "publish_at";
  ALTER TABLE "_reviews_v" DROP COLUMN "version_publish_at";`)
}
