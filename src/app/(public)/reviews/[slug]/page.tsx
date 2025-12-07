/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
import { getPayload } from "payload";
import configPromise from "@payload-config";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Star, Calendar, User } from "lucide-react";
import type { Media } from "@/payload-types";
import { RichText } from "@payloadcms/richtext-lexical/react";
import { ShareButton } from "@/components/ShareButton";
import { CommentSection } from "@/components/comments/CommentSection";
import { LikeButton } from "@/components/reviews/LikeButton";
import { ViewTracker } from "@/components/analytics/ViewTracker";
import { RelatedReviews } from "@/components/reviews/RelatedReviews";
import { ReadingProgressBar } from "@/components/ReadingProgressBar";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPayload({ config: configPromise });

  const { docs: reviews } = await payload.find({
    collection: "reviews",
    where: {
      slug: {
        equals: slug,
      },
      _status: {
        equals: "published",
      },
    },
    limit: 1,
    depth: 1,
  });

  const review = reviews[0];

  if (!review) {
    return {
      title: "Review Not Found",
    };
  }

  const coverImage = review.coverImage as any;
  const description = `Read our review of ${review.title} by ${review.bookAuthor}. Rating: ${review.rating}/5 stars.`;

  return {
    title: review.title,
    description,
    openGraph: {
      title: review.title,
      description,
      type: "article",
      images: coverImage?.url
        ? [
            {
              url: coverImage.url,
              width: 800,
              height: 1200,
              alt: review.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: review.title,
      description,
      images: coverImage?.url ? [coverImage.url] : [],
    },
  };
}

export default async function ReviewPage({ params }: PageProps) {
  const { slug } = await params;
  const payload = await getPayload({ config: configPromise });

  const { docs: reviews } = await payload.find({
    collection: "reviews",
    where: {
      slug: {
        equals: slug,
      },
      _status: {
        equals: "published",
      },
    },
    limit: 1,
    depth: 2,
  });

  const review = reviews[0];

  if (!review) {
    notFound();
  }

  const coverImage = review.coverImage as Media;

  return (
    <article className="min-h-screen pb-20">
      <ReadingProgressBar />
      <ViewTracker reviewId={String(review.id)} />
      {/* Hero Header */}
      <div className="bg-muted/30 py-12 md:py-20">
        <div className="container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-12 items-start">
            {/* Book Cover */}
            <div className="mx-auto lg:mx-0 w-[240px] md:w-[300px] aspect-2/3 relative shadow-2xl rounded-lg rotate-2 hover:rotate-0 transition-transform duration-500 bg-background">
              {coverImage?.url && (
                <Image
                  src={coverImage.url}
                  alt={coverImage.alt || review.title}
                  fill
                  className="object-cover rounded-lg"
                  priority
                  sizes="(max-width: 768px) 100vw, 300px"
                />
              )}
            </div>

            {/* Header Content */}
            <div className="space-y-6 text-center lg:text-left">
              <div className="space-y-2">
                <div className="flex items-center justify-center lg:justify-start gap-2 text-primary">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${
                        i < review.rating
                          ? "fill-current"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
                <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                  {review.title}
                </h1>
                <p className="text-xl text-muted-foreground font-medium">
                  by {review.bookAuthor}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>{(review.author as any)?.name}</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(
                      review.publishDate || review.createdAt
                    ).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap justify-center lg:justify-start gap-2">
                {review.genres &&
                  Array.isArray(review.genres) &&
                  review.genres.map((genre: any) => (
                    <Badge key={genre.id} variant="secondary">
                      {genre.name}
                    </Badge>
                  ))}

                <ShareButton
                  title={`Read this review of ${review.title}`}
                  className="ml-2"
                />
                <LikeButton
                  reviewId={String(review.id)}
                  initialLikes={review.likes || 0}
                  className="ml-2"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 md:px-12 lg:px-24 py-12 grid gap-12 lg:grid-cols-[1fr_300px] max-w-7xl">
        <div className="space-y-12">
          {/* Review Content */}
          <div className="prose prose-lg prose-gray dark:prose-invert max-w-3xl font-serif">
            <RichText data={review.reviewContent} />
          </div>

          {/* Structured Sections */}
          <div className="grid gap-8 md:grid-cols-2">
            {review.whatILoved && (
              <div className="bg-green-50 dark:bg-green-950/20 p-6 rounded-xl border border-green-100 dark:border-green-900">
                <h3 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 text-green-800 dark:text-green-300">
                  What I Loved
                </h3>
                <div className="prose prose-sm dark:prose-invert">
                  <RichText data={review.whatILoved} />
                </div>
              </div>
            )}

            {review.whatCouldBeBetter && (
              <div className="bg-orange-50 dark:bg-orange-950/20 p-6 rounded-xl border border-orange-100 dark:border-orange-900">
                <h3 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 text-orange-800 dark:text-orange-300">
                  What Could Be Better
                </h3>
                <div className="prose prose-sm dark:prose-invert">
                  <RichText data={review.whatCouldBeBetter} />
                </div>
              </div>
            )}

            {review.perfectFor && (
              <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-xl border border-blue-100 dark:border-blue-900 md:col-span-2">
                <h3 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 text-blue-800 dark:text-blue-300">
                  Perfect For
                </h3>
                <div className="prose prose-sm dark:prose-invert">
                  <RichText data={review.perfectFor} />
                </div>
              </div>
            )}
          </div>

          {/* Favorite Quotes */}
          {review.favoriteQuotes && review.favoriteQuotes.length > 0 && (
            <div className="space-y-6">
              <h3 className="font-serif text-2xl font-bold border-b pb-2">
                Favorite Quotes
              </h3>
              <div className="grid gap-6">
                {review.favoriteQuotes.map((item: any, i: number) => (
                  <blockquote
                    key={i}
                    className="relative pl-8 italic text-xl text-muted-foreground border-l-4 border-primary/30"
                  >
                    "{item.quote}"
                    {item.page && (
                      <footer className="text-sm not-italic mt-2 text-muted-foreground/60">
                        — Page {item.page}
                      </footer>
                    )}
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Tags */}
          {review.tags &&
            Array.isArray(review.tags) &&
            review.tags.length > 0 && (
              <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <h3 className="font-semibold mb-4">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {review.tags.map((tag: any) => (
                    <Badge key={tag.id} variant="outline">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

          {/* Moods */}
          {review.moodTags &&
            Array.isArray(review.moodTags) &&
            review.moodTags.length > 0 && (
              <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <h3 className="font-semibold mb-4">Mood</h3>
                <div className="flex flex-wrap gap-2">
                  {review.moodTags.map((mood: any) => (
                    <div
                      key={mood.id}
                      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      style={{
                        backgroundColor: mood.color + "20",
                        color: mood.color,
                        borderColor: mood.color + "40",
                      }}
                    >
                      {mood.icon && <span className="mr-1">{mood.icon}</span>}
                      {mood.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Reading Log */}
          {(review.readingStartDate || review.readingFinishDate) && (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
              <h3 className="font-semibold mb-4">Reading Log</h3>
              <div className="space-y-3 text-sm">
                {review.readingStartDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Started</span>
                    <span className="font-medium">
                      {new Date(review.readingStartDate).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </span>
                  </div>
                )}
                {review.readingFinishDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Finished</span>
                    <span className="font-medium">
                      {new Date(review.readingFinishDate).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Reviews */}
      <div className="container mx-auto px-6 md:px-12 lg:px-24 pb-12 max-w-7xl">
        <RelatedReviews
          currentReviewId={review.id}
          genres={review.genres}
          tags={review.tags}
          moodTags={review.moodTags}
        />
      </div>

      {/* Comments Section */}
      <Separator className="my-8" />
      <CommentSection reviewId={review.id} />
    </article>
  );
}
