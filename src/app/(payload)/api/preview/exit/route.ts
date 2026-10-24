import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { isSameOriginPath } from "@/lib/preview";

/**
 * The preview exit action (`FR-3`).
 *
 * `POST` with a `returnTo` form field: it disables draft mode and sends the
 * editor back to the page they were on. It is a `POST` because disabling draft
 * mode changes what every *future* request renders, and a `GET` would let a
 * prefetch or a crawler end a preview.
 *
 * The response is a `303` rather than the default `307`: the browser must
 * follow with a `GET`, otherwise it would replay this `POST` against the page
 * URL, which no page route accepts.
 *
 * `returnTo` comes from the browser, so it is only honoured when it is a rooted,
 * same-origin path; anything else falls back to the home page instead of
 * turning the action into an open redirect.
 */
export async function POST(request: Request): Promise<Response> {
	let returnTo = "/";

	try {
		const body = await request.formData();
		const requested = body.get("returnTo");

		if (isSameOriginPath(requested)) {
			returnTo = requested;
		}
	} catch {
		// A body that is not form data leaves the fallback in place: the exit is
		// still honoured, only the destination is not.
	}

	const draft = await draftMode();
	draft.disable();

	return NextResponse.redirect(new URL(returnTo, request.url), 303);
}
