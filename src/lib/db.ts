import { getPayload } from "payload";
import configPromise from "@payload-config";
import { sql } from "drizzle-orm";

type CounterField = "views" | "likes";

/**
 * Atomically increment a numeric field on a review.
 * Uses raw SQL to ensure concurrent requests don't cause lost updates.
 *
 * @param reviewId - The numeric ID of the review
 * @param field - The field to increment ("views" or "likes")
 * @param delta - Amount to increment by (default: 1)
 * @returns The new value after increment, or null if review not found
 */
export async function atomicIncrement(
  reviewId: number,
  field: CounterField,
  delta: number = 1
): Promise<number | null> {
  try {
    const payload = await getPayload({ config: configPromise });
    const drizzle = payload.db.drizzle;

    // Use raw SQL for atomic increment
    // The RETURNING clause gives us the new value after update
    const result = await drizzle.execute(
      sql`UPDATE reviews 
          SET ${sql.identifier(field)} = COALESCE(${sql.identifier(field)}, 0) + ${delta}
          WHERE id = ${reviewId}
          RETURNING ${sql.identifier(field)}`
    );

    // Check if any row was updated
    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    return result.rows[0][field] as number;
  } catch (error) {
    console.error(`[DB] Failed to increment ${field}:`, error);
    return null;
  }
}

/**
 * Atomically decrement a numeric field on a review.
 * Ensures the value doesn't go below 0.
 *
 * @param reviewId - The numeric ID of the review
 * @param field - The field to decrement ("views" or "likes")
 * @param delta - Amount to decrement by (default: 1)
 * @returns The new value after decrement, or null if review not found
 */
export async function atomicDecrement(
  reviewId: number,
  field: CounterField,
  delta: number = 1
): Promise<number | null> {
  try {
    const payload = await getPayload({ config: configPromise });
    const drizzle = payload.db.drizzle;

    // Use GREATEST to ensure we don't go below 0
    const result = await drizzle.execute(
      sql`UPDATE reviews 
          SET ${sql.identifier(field)} = GREATEST(0, COALESCE(${sql.identifier(field)}, 0) - ${delta})
          WHERE id = ${reviewId}
          RETURNING ${sql.identifier(field)}`
    );

    // Check if any row was updated
    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    return result.rows[0][field] as number;
  } catch (error) {
    console.error(`[DB] Failed to decrement ${field}:`, error);
    return null;
  }
}
