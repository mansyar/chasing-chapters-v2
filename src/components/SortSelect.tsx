"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SORT_OPTIONS, type SortOption } from "@/lib/reviews-sort";

const SORT_LABELS: Record<SortOption, string> = {
	recent: "Most Recent",
	rating: "Highest Rated",
	title: "Title A–Z",
};

interface SortSelectProps {
	currentSort: SortOption;
}

export function SortSelect({ currentSort }: SortSelectProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const pathname = usePathname();

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
				Sort by
			</label>
			<Select defaultValue={currentSort} onValueChange={handleValueChange}>
				<SelectTrigger id="reviews-sort" className="w-[160px]">
					<SelectValue placeholder="Sort by" />
				</SelectTrigger>
				<SelectContent>
					{SORT_OPTIONS.map((option) => (
						<SelectItem key={option} value={option}>
							{SORT_LABELS[option]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
