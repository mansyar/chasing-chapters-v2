import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Marquee } from "@/components/ui/marquee";
import type { Genre } from "@/payload-types";

interface GenreMarqueeProps {
	genres: Genre[];
}

export function GenreMarquee({ genres }: GenreMarqueeProps) {
	if (genres.length === 0) return null;

	return (
		<section className="py-6 border-b bg-muted/20 min-h-[80px]">
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
