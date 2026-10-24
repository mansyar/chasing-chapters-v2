"use client";

import { useRouter } from "next/navigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";

interface Genre {
	id: number | string;
	slug?: string | null;
	// A localized name is empty in this locale until an author writes one, in
	// which case Payload falls back to the default-locale value (FR-10).
	name?: string | null;
}

interface GenreSelectProps {
	genres: Genre[];
	currentGenre?: string;
	dictionary: Dictionary;
	locale: Locale;
}

export function GenreSelect({
	genres,
	currentGenre,
	dictionary,
	locale,
}: GenreSelectProps) {
	const router = useRouter();

	const handleValueChange = (value: string) => {
		if (value === "all") {
			router.push(`/${locale}/reviews`);
		} else {
			router.push(`/${locale}/reviews?genre=${value}`);
		}
	};

	// Filter out genres without valid slugs
	const validGenres = genres.filter((g): g is Genre & { slug: string } =>
		Boolean(g.slug),
	);

	return (
		<Select
			defaultValue={currentGenre || "all"}
			onValueChange={handleValueChange}
		>
			<SelectTrigger className="w-full">
				<SelectValue placeholder={dictionary.browseSelectGenre} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">{dictionary.browseAllGenres}</SelectItem>
				{validGenres.map((g) => (
					<SelectItem key={g.id} value={g.slug}>
						{g.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
