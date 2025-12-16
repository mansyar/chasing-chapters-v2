/**
 * Migration script to hash existing commenter email addresses.
 * Run this ONCE after deploying the code changes.
 *
 * Usage: pnpm tsx src/scripts/migrate-emails.ts
 */

// Load environment variables first (before any other imports)
import "dotenv/config";

import { getPayload } from "payload";
import configPromise from "@payload-config";
import crypto from "crypto";

async function migrateEmails() {
  console.log("🔐 Email Hashing Migration");
  console.log("==========================\n");

  const payload = await getPayload({ config: configPromise });

  console.log("Fetching all commenters...");
  const { docs: commenters } = await payload.find({
    collection: "commenters",
    limit: 1000,
    depth: 0,
  });

  console.log(`Found ${commenters.length} commenters to check\n`);

  let migrated = 0;
  let skipped = 0;

  for (const commenter of commenters) {
    // Check if we have emailHash field (new schema) vs email field (old schema)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentValue =
      (commenter as any).emailHash || (commenter as any).email;

    if (!currentValue) {
      console.log(`⚠️  Skipping ${commenter.id} - no email found`);
      skipped++;
      continue;
    }

    // Skip if already looks like a hash (64 char hex string)
    if (currentValue.length === 64 && /^[a-f0-9]+$/.test(currentValue)) {
      console.log(`✓  Skipping ${commenter.id} - already hashed`);
      skipped++;
      continue;
    }

    // Hash the email
    const hash = crypto
      .createHash("sha256")
      .update(currentValue.toLowerCase().trim())
      .digest("hex");

    try {
      await payload.update({
        collection: "commenters",
        id: commenter.id,
        data: {
          // Use type assertion since schema is changing
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          emailHash: hash,
        } as any,
      });

      console.log(
        `✅ Migrated ${commenter.id}: ${currentValue} → ${hash.slice(0, 16)}...`
      );
      migrated++;
    } catch (error) {
      console.error(`❌ Failed to migrate ${commenter.id}:`, error);
    }
  }

  console.log("\n==========================");
  console.log(`Migration complete!`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);

  process.exit(0);
}

migrateEmails().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
