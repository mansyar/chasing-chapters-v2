import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	icon?: LucideIcon;
	title: string;
	description?: string;
	/** Optional call-to-action rendered below the description. */
	action?: React.ReactNode;
	className?: string;
}

/**
 * Reusable empty-state block for lists and search results.
 */
export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 py-16 text-center",
				className,
			)}
		>
			{Icon && (
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<Icon className="h-6 w-6" aria-hidden="true" />
				</div>
			)}
			<h3 className="font-serif text-xl font-semibold">{title}</h3>
			{description && (
				<p className="max-w-sm text-sm text-muted-foreground">{description}</p>
			)}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
