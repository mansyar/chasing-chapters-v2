import { getPayload } from "payload";
import configPromise from "@payload-config";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { ReviewCard } from "@/components/ReviewCard";
import { ShareButton } from "@/components/ShareButton";
import type { Media, Review } from "@/payload-types";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo/structured-data";

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

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

  const { docs: lists } = await payload.find({
    collection: "reading-lists",
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

  const list = lists[0];

  if (!list) {
    return {
      title: "Reading List Not Found",
    };
  }

  const coverImage = list.coverImage as Media | null | undefined;
  const description = list.description || `Curated reading list: ${list.title}`;

  return {
    title: list.title,
    description,
    alternates: {
      canonical: `${SITE_URL}/reading-lists/${list.slug}`,
    },
    openGraph: {
      title: list.title,
      description,
      type: "website",
      images: coverImage?.url
        ? [
            {
              url: coverImage.url,
              width: 1200,
              height: 630,
              alt: list.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: list.title,
      description,
      images: coverImage?.url ? [coverImage.url] : [],
    },
  };
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise });
  const { docs } = await payload.find({
    collection: "reading-lists",
    where: {
      _status: {
        equals: "published",
      },
    },
    limit: 20, // Pre-build top 20 lists
    select: {
      slug: true,
    },
  });

  return docs.map((doc) => ({
    slug: doc.slug,
  }));
}

export default async function ReadingListDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const payload = await getPayload({ config: configPromise });

  const { docs: lists } = await payload.find({
    collection: "reading-lists",
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

  const list = lists[0];

  if (!list) {
    notFound();
  }

  const coverImage = list.coverImage as Media;
  const reviews = (list.reviews as Review[]) || [];

  const breadcrumbJsonLd = generateBreadcrumbSchema([
    { name: "Home", url: SITE_URL },
    { name: "Reading Lists", url: `${SITE_URL}/reading-lists` },
    { name: list.title, url: `${SITE_URL}/reading-lists/${list.slug}` },
  ]);

  return (
    <div className="min-h-screen pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* Hero Header */}
      <div className="relative bg-muted/30 py-20 md:py-32 overflow-hidden">
        <div className="container px-4 md:px-6 relative z-10 text-center max-w-3xl mx-auto">
          <h1 className="font-serif text-4xl md:text-6xl font-bold tracking-tight mb-6">
            {list.title}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed mb-8">
            {list.description}
          </p>
          <div className="flex justify-center">
            <ShareButton title={`Check out this reading list: ${list.title}`} />
          </div>
        </div>

        {/* Background Blur Effect */}
        {coverImage?.url && (
          <div className="absolute inset-0 z-0 opacity-10 blur-3xl scale-110">
            <Image
              src={coverImage.url}
              alt=""
              fill
              className="object-cover"
              placeholder={coverImage.blurDataURL ? "blur" : "empty"}
              blurDataURL={coverImage.blurDataURL || undefined}
            />
          </div>
        )}
      </div>

      {/* Reviews Grid */}
      <div className="container px-4 md:px-6 py-16">
        {reviews.length > 0 ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No reviews added to this list yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
