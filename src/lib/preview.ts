import type { Metadata } from "next";
import { type Locale, localizePath } from "./i18n/locale";

/**
 * The draft-preview rule (`FR-1`, `FR-2`).
 *
 * Draft mode is a per-browser, per-request cache bypass, and its cookie
 * (`__prerender_bypass`) survives a logout. "Draft mode is on" is therefore not
 * permission to show a draft: the session is the authority. The rule lives here,
 * in one small module - no `payload` client, no request APIs, no I/O, and only
 * a type-level `next` import - so the entry route, the page and the unit tests
 * cannot drift apart.
 *
 * The module is deliberately tiny. The part of this feature that can break the
 * site is not the rule but *where* it is read: a route stops being statically
 * generatable the moment its render reads the request unconditionally. Keeping
 * the decision a pure function of two booleans means the page reads the request
 * once, behind the draft-mode branch, which is what leaves the public route
 * pre-rendered (`NFR-1`).
 */

/** What a request knows about itself when the page decides what to render. */
export interface PreviewRequestState {
	/** `(await draftMode()).isEnabled` for this request. */
	draftEnabled: boolean;
	/** Whether `payload.auth()` found a user behind the request's cookies. */
	hasSession: boolean;
}

/**
 * Whether this request may render the newest, possibly unpublished version.
 *
 * Both halves are required (`FR-2`): the bypass cookie without a session falls
 * back to the public view - never draft content - and a session without the
 * cookie is just a signed-in reader on a public page.
 */
export function canRenderDraft({
	draftEnabled,
	hasSession,
}: PreviewRequestState): boolean {
	return draftEnabled && hasSession;
}

/** The public path of a review in a locale: `/en/reviews/<slug>`. */
export function reviewPath(slug: string, locale: Locale): string {
	return localizePath(`/reviews/${slug}`, locale);
}

/** The locale the preview banner offers as the alternative (`FR-3`). */
export function otherLocale(locale: Locale): Locale {
	return locale === "en" ? "id" : "en";
}

/**
 * Whether a browser-supplied path may be redirected to.
 *
 * The exit action returns the editor to the page they came from, and that path
 * arrives in the request. Only a rooted, same-origin path qualifies: `//host`
 * and `/\host` are protocol-relative URLs to another origin, and a bare word is
 * not a path at all. Rejecting them here is what stops the exit action from
 * becoming an open redirect.
 */
export function isSameOriginPath(value: unknown): value is string {
	if (typeof value !== "string" || !value.startsWith("/")) {
		return false;
	}

	return !value.startsWith("//") && !value.startsWith("/\\");
}

/**
 * The document metadata a previewed page carries (`FR-4`).
 *
 * Four things are absent, and their absence is the point: no canonical, no
 * hreflang alternates, and no Open Graph image - a preview must never nominate
 * itself as the address of the review, in any language, nor hand a crawler a
 * shareable card. `robots` says the rest: `noindex, nofollow`.
 *
 * The Open Graph image needs its own word. The review route has an
 * `opengraph-image.tsx`, and Next only falls back to that file convention when
 * the page's metadata does not mention `images` at all - so the image is
 * suppressed by stating an empty list, not by leaving the key out.
 *
 * The title and description stay: an author verifying the *content* of a
 * preview needs the page to say which review it is.
 */
export function buildPreviewMetadata(input: {
	title: string;
	description: string;
}): Metadata {
	return {
		title: input.title,
		description: input.description,
		robots: {
			index: false,
			follow: false,
		},
		openGraph: {
			type: "article",
			title: input.title,
			description: input.description,
			images: [],
		},
	};
}
