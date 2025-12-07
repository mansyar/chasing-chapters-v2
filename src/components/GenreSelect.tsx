"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Genre {
  id: number | string;
  slug?: string | null;
  name: string;
}

interface GenreSelectProps {
  genres: Genre[];
  currentGenre?: string;
}

export function GenreSelect({ genres, currentGenre }: GenreSelectProps) {
  const router = useRouter();

  const handleValueChange = (value: string) => {
    if (value === "all") {
      router.push("/reviews");
    } else {
      router.push(`/reviews?genre=${value}`);
    }
  };

  // Filter out genres without valid slugs
  const validGenres = genres.filter((g): g is Genre & { slug: string } =>
    Boolean(g.slug)
  );

  return (
    <Select
      defaultValue={currentGenre || "all"}
      onValueChange={handleValueChange}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a genre" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Genres</SelectItem>
        {validGenres.map((g) => (
          <SelectItem key={g.id} value={g.slug}>
            {g.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
