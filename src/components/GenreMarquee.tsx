import Link from "next/link";
import { Marquee } from "@/components/ui/marquee";
import { Badge } from "@/components/ui/badge";
import type { Genre } from "@/payload-types";

interface GenreMarqueeProps {
  genres: Genre[];
}

export function GenreMarquee({ genres }: GenreMarqueeProps) {
  if (genres.length === 0) return null;

  return (
    <section className="py-6 border-b bg-muted/20">
      <Marquee pauseOnHover className="[--duration:50s] [--gap:0.75rem]">
        {genres.map((genre) => (
          <Link key={genre.id} href={`/reviews?genre=${genre.slug}`}>
            <Badge
              variant="outline"
              className="text-sm px-4 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
            >
              {genre.name}
            </Badge>
          </Link>
        ))}
      </Marquee>
    </section>
  );
}
