import { getPayload } from "payload";
import configPromise from "@payload-config";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import type { Media } from "@/payload-types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reading Lists",
  description: "Curated collections of books for every mood and occasion.",
};

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

export default async function ReadingListsPage() {
  const payload = await getPayload({ config: configPromise });

  const { docs: readingLists } = await payload.find({
    collection: "reading-lists",
    where: {
      _status: {
        equals: "published",
      },
    },
    sort: "-createdAt",
  });

  return (
    <div className="container mx-auto px-4 md:px-6 py-12">
      <div className="space-y-4 mb-12 text-center">
        <h1 className="font-serif text-4xl font-bold tracking-tight">
          Reading Lists
        </h1>
        <p className="text-muted-foreground max-w-[600px] mx-auto">
          Curated collections of books for every mood and occasion.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {readingLists.map((list) => {
          const coverImage = list.coverImage as Media;

          return (
            <Link
              key={list.id}
              href={`/reading-lists/${list.slug}`}
              className="group block h-full"
            >
              <Card className="h-full overflow-hidden border-none shadow-none bg-transparent hover:bg-muted/30 transition-colors">
                <div className="aspect-video relative overflow-hidden rounded-xl shadow-md group-hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1">
                  {coverImage?.url ? (
                    <Image
                      src={coverImage.url}
                      alt={coverImage.alt || list.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                      No Image
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                </div>
                <CardContent className="pt-6 px-2">
                  <h3 className="font-serif text-2xl font-bold mb-2 group-hover:text-primary transition-colors">
                    {list.title}
                  </h3>
                  <p className="text-muted-foreground line-clamp-2">
                    {list.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {readingLists.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p>No reading lists published yet.</p>
        </div>
      )}
    </div>
  );
}
