/**
 * Backfill script to generate blur data URLs for existing media.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-blur-data-urls.ts
 *
 * This script:
 * 1. Fetches all media records without blurDataURL
 * 2. Downloads each image from R2/CDN
 * 3. Generates a blur data URL using sharp
 * 4. Updates the media record with the new blurDataURL
 */

// Load environment variables BEFORE importing payload config
import "dotenv/config";

import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import sharp from "sharp";

async function generateBlurDataURL(imageUrl: string): Promise<string | null> {
  try {
    // Handle relative URLs by prepending base URL
    let fullUrl = imageUrl;
    if (imageUrl.startsWith("/")) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      fullUrl = `${baseUrl}${imageUrl}`;
    }

    console.log(`  Fetching: ${fullUrl}`);

    // Fetch the image from the URL
    const response = await fetch(fullUrl);
    if (!response.ok) {
      console.error(
        `  Failed to fetch image: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a tiny 10x10 blurred version
    const blurredBuffer = await sharp(buffer)
      .resize(10, 10, { fit: "cover" })
      .blur(2)
      .toFormat("webp", { quality: 20 })
      .toBuffer();

    return `data:image/webp;base64,${blurredBuffer.toString("base64")}`;
  } catch (error) {
    console.error(`Error generating blur for ${imageUrl}:`, error);
    return null;
  }
}

async function backfillBlurDataUrls() {
  console.log("Starting blur data URL backfill...\n");

  const payload = await getPayload({ config: configPromise });

  // Fetch all media records
  const { docs: allMedia, totalDocs } = await payload.find({
    collection: "media",
    limit: 1000, // Adjust if you have more images
    depth: 0,
  });

  console.log(`Found ${totalDocs} total media records`);

  // Filter to only those without blurDataURL
  const mediaWithoutBlur = allMedia.filter((m) => !m.blurDataURL && m.url);
  console.log(`${mediaWithoutBlur.length} records need blur data URLs\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const media of mediaWithoutBlur) {
    if (!media.url) {
      console.log(`⏭️  Skipping ${media.id} - no URL`);
      continue;
    }

    console.log(`Processing: ${media.filename || media.id}...`);

    const blurDataURL = await generateBlurDataURL(media.url);

    if (blurDataURL) {
      try {
        await payload.update({
          collection: "media",
          id: media.id,
          data: {
            blurDataURL,
          },
        });
        console.log(`✅ Updated: ${media.filename || media.id}`);
        successCount++;
      } catch (updateError) {
        console.error(`❌ Failed to update ${media.id}:`, updateError);
        errorCount++;
      }
    } else {
      console.log(
        `⚠️  Could not generate blur for ${media.filename || media.id}`
      );
      errorCount++;
    }
  }

  console.log("\n--- Backfill Complete ---");
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📊 Total processed: ${mediaWithoutBlur.length}`);

  process.exit(0);
}

backfillBlurDataUrls().catch((error) => {
  console.error("Backfill script failed:", error);
  process.exit(1);
});
