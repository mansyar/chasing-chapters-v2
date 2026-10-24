"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { SORT_OPTIONS, type SortOption } from "@/lib/reviews-sort";

interface SortSelectProps {
	currentSort: SortOption;
	dictionary: Dictionary;
}

export function SortSelect({ currentSort, dictionary }: SortSelectProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const pathname = usePathname();

	const sortLabels: Record<SortOption, string> = {
		recent: dictionary.browseSortRecent,
		rating: dictionary.browseSortRating,
		title: dictionary.browseSortTitle,
	};

	const handleValueChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		// Changing the sort always starts a new result set from page 1
		params.delete("page");
		if (value === "recent") {
			// "recent" is the default; keep URLs clean
			params.delete("sort");
		} else {
			params.set("sort", value);
		}
		const queryString = params.toString();
		router.push(queryString ? `${pathname}?${queryString}` : pathname);
	};

	return (
		<div className="flex items-center gap-2">
			<label
				htmlFor="reviews-sort"
				className="text-sm text-muted-foreground whitespace-nowrap"
			>
				{dictionary.browseSortLabel}
			</label>
			<Select defaultValue={currentSort} onValueChange={handleValueChange}>
				<SelectTrigger id="reviews-sort" className="w-[160px]">
					<SelectValue placeholder={dictionary.browseSortLabel} />
				</SelectTrigger>
				<SelectContent>
					{SORT_OPTIONS.map((option) => (
						<SelectItem key={option} value={option}>
							{sortLabels[option]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
