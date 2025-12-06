import { getPayload } from "payload";
import configPromise from "@payload-config";
import { Genre, Tag, MoodTag } from "@/payload-types";
import { ReviewCard } from "../ReviewCard";
import { Where } from "payload";

interface RelatedReviewsProps {
  currentReviewId: number;
  genres?: (Genre | number)[] | null;
  tags?: (Tag | number)[] | null;
  moodTags?: (MoodTag | number)[] | null;
}

export async function RelatedReviews({
  currentReviewId,
  genres = [],
  tags = [],
  moodTags = [],
}: RelatedReviewsProps) {
  // 1. Extract IDs safely
  const genreIds = (genres || [])
    .map((g) => (typeof g === "number" ? g : g.id))
    .filter(Boolean);

  const tagIds = (tags || [])
    .map((t) => (typeof t === "number" ? t : t.id))
    .filter(Boolean);

  const moodTagIds = (moodTags || [])
    .map((m) => (typeof m === "number" ? m : m.id))
    .filter(Boolean);

  // If there's nothing to match on, don't show anything
  if (genreIds.length === 0 && tagIds.length === 0 && moodTagIds.length === 0) {
    return null;
  }

  const payload = await getPayload({ config: configPromise });

  // 2. Build Query
  // We want: Status=Published AND ID!=Current AND (Genre IN [...] OR Tag IN [...] OR Mood IN [...])
  const orConditions: Where[] = [];

  if (genreIds.length > 0) {
    orConditions.push({
      genres: {
        in: genreIds,
      },
    });
  }
  if (tagIds.length > 0) {
    orConditions.push({
      tags: {
        in: tagIds,
      },
    });
  }
  if (moodTagIds.length > 0) {
    orConditions.push({
      moodTags: {
        in: moodTagIds,
      },
    });
  }

  const { docs: relatedReviews } = await payload.find({
    collection: "reviews",
    where: {
      and: [
        {
          id: {
            not_equals: currentReviewId,
          },
        },
        {
          _status: {
            equals: "published",
          },
        },
        {
          or: orConditions,
        },
      ],
    },
    limit: 3,
    depth: 1,
  });

  if (!relatedReviews || relatedReviews.length === 0) {
    return null;
  }

  return (
    <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center md:text-left">
        <h2 className="text-3xl font-serif font-bold text-foreground">
          More Like This
        </h2>
        <p className="text-muted-foreground mt-2">
          Based on genres, tags, and moods you might enjoy.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {relatedReviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </section>
  );
}
