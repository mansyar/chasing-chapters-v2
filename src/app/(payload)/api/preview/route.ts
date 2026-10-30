import configPromise from "@payload-config";
import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { hasLocale, localizePath } from "@/lib/i18n/locale";

/**
 * The draft-preview entry point (`FR-1`).
 *
 * `GET ?slug=...&locale=...` validates the admin session, enables draft mode
 * for that browser, and redirects to the review's real public URL. It is a
 * `GET` because it is opened in a new tab by Payload's Preview button, and it
 * is safe to repeat: enabling draft mode twice is idempotent.
 *
 * The authority is the session cookie and nothing else (`NFR-2`): there is no
 * secret in the URL and no new environment variable. A refused request returns
 * `401` **before** anything is enabled - a 401 that still set the bypass cookie
 * would be worse than useless.
 *
 * The review is looked up with `draft: true` and no `_status`/`publishAt`
 * filter, because the whole point is to preview what the public gate hides. The
 * lookup runs as the signed-in user, so a writer can only preview their own
 * reviews - the same access rule the admin panel applies.
 */
export async function GET(request: Request): Promise<Response> {
	const { searchParams } = new URL(request.url);
	const slug = searchParams.get("slug")?.trim() ?? "";
	const locale = searchParams.get("locale");

	if (!slug) {
		return Response.json({ error: "A slug is required" }, { status: 400 });
	}

	if (!hasLocale(locale)) {
		return Response.json(
			{ error: "A supported locale is required" },
			{ status: 400 },
		);
	}

	const payload = await getPayload({ config: configPromise });
	const { user } = await payload.auth({ headers: request.headers });

	if (!user) {
		return Response.json({ error: "Authentication required" }, { status: 401 });
	}

	const { docs } = await payload.find({
		collection: "reviews",
		where: {
			slug: {
				equals: slug,
			},
		},
		limit: 1,
		depth: 0,
		locale,
		draft: true,
		overrideAccess: false,
		user,
		// One document by slug: the total is never read, and asking for it costs
		// a second query (`select count(*)`) before the redirect is sent.
		pagination: false,
	});

	if (docs.length === 0) {
		return Response.json({ error: "Review not found" }, { status: 404 });
	}

	// `enable()` sets `__prerender_bypass` on this response, so the redirect and
	// the cookie reach the browser together.
	const draft = await draftMode();
	draft.enable();

	return NextResponse.redirect(
		new URL(localizePath(`/reviews/${slug}`, locale), request.url),
	);
}
