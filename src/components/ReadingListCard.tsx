import Link from "next/link";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReadingList, Media } from "@/payload-types";

interface ReadingListCardProps {
  readingList: ReadingList;
  className?: string;
  priority?: boolean;
}

export function ReadingListCard({
  readingList,
  className,
  priority = false,
}: ReadingListCardProps) {
  const coverImage = readingList.coverImage as Media;
  const bookCount = Array.isArray(readingList.reviews)
    ? readingList.reviews.length
    : 0;

  return (
    <Link
      href={`/reading-lists/${readingList.slug}`}
      className={cn("group block h-full", className)}
    >
      <Card className="h-full overflow-hidden border-none shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card">
        <div className="aspect-video relative overflow-hidden rounded-t-lg">
          {coverImage?.url ? (
            <Image
              src={coverImage.url}
              alt={coverImage.alt || readingList.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, 25vw"
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              placeholder={coverImage.blurDataURL ? "blur" : "empty"}
              blurDataURL={coverImage.blurDataURL || undefined}
            />
          ) : (
            <div className="w-full h-full bg-linear-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-transparent" />
          <Badge
            variant="secondary"
            className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm"
          >
            <BookOpen className="h-3 w-3 mr-1" />
            {bookCount} {bookCount === 1 ? "book" : "books"}
          </Badge>
        </div>
        <CardContent className="pt-4 pb-5">
          <h3 className="font-serif text-lg font-bold leading-tight group-hover:text-primary transition-colors line-clamp-1">
            {readingList.title}
          </h3>
          {readingList.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {readingList.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
