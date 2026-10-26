"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ERROR_COPY } from "@/lib/error-locale";
import type { Locale } from "@/lib/i18n/locale";

interface ErrorContentProps {
	locale: Locale;
	homeHref: string;
	onRetry: () => void;
}

/**
 * The branded error page both boundaries render.
 *
 * Presentational only: it reads copy from the client-safe table (never the
 * server dictionary) and shows recovery actions — never the error's message,
 * stack, or digest, which stay in Sentry.
 */
export function ErrorContent({ locale, homeHref, onRetry }: ErrorContentProps) {
	const copy = ERROR_COPY[locale];

	return (
		<div
			role="alert"
			className="mx-auto flex w-full max-w-xl flex-col items-center px-6 py-16 text-center sm:py-24"
		>
			<p
				aria-hidden="true"
				className="font-serif text-6xl font-medium md:text-8xl"
			>
				!
			</p>
			<h1 className="font-serif text-2xl md:text-3xl">{copy.title}</h1>
			<p className="mt-4 max-w-md text-lg text-muted-foreground">
				{copy.description}
			</p>
			<div className="mt-8 flex gap-4">
				<Button onClick={onRetry}>{copy.tryAgain}</Button>
				<Button variant="outline" asChild>
					<Link href={homeHref}>{copy.home}</Link>
				</Button>
			</div>
		</div>
	);
}
