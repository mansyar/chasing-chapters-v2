import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Only add the blur_data_u_r_l column to media table
  // Note: The email→email_hash changes were already applied in production via dev mode sync
  await db.execute(sql`
    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "blur_data_u_r_l" varchar;
  `);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" DROP COLUMN IF EXISTS "blur_data_u_r_l";
  `);
}
