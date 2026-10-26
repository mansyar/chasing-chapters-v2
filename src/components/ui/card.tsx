import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The base every content card shares: a whole-card link with the hover lift,
 * the card surface, and the overflow clipping its cover image needs.
 *
 * `ReviewCard` and `ReadingListCard` had this markup duplicated character for
 * character; it lives here so the two cannot drift into two visual languages,
 * and so a new card gets the treatment by construction.
 */
function CardLink({
	className,
	children,
	...props
}: React.ComponentProps<typeof Link>) {
	return (
		<Link className={cn("group block h-full", className)} {...props}>
			<Card className="h-full overflow-hidden border-none shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card">
				{children}
			</Card>
		</Link>
	);
}

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn(
				"bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
				className,
			)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
				className,
			)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-title"
			className={cn("leading-none font-semibold", className)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			className={cn("px-6", className)}
			{...props}
		/>
	);
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
			{...props}
		/>
	);
}

export { Card, CardContent, CardFooter, CardHeader, CardLink, CardTitle };
