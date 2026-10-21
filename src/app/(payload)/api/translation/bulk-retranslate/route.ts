import configPromise from "@payload-config";
import { getPayload } from "payload";
import {
	normalizeBulkRetranslateIds,
	retranslateReviews,
} from "@/lib/retranslate";

/**
 * Bulk re-translate endpoint (FR-4).
 *
 * POST body: `{ "ids": number[] }` — the reviews to re-translate. Each review
 * is re-translated sequentially (the translation provider is rate limited) and
 * the response reports one outcome per review. The request is authenticated
 * with the admin session (the `payload-token` cookie) and every review is
 * resolved through the Reviews access rules, so a writer can only ever
 * re-translate their own reviews.
 */
export async function POST(request: Request): Promise<Response> {
	// Only same-origin JSON requests are accepted. A cross-site form post
	// cannot set this content type without a CORS preflight, so a cookie
	// authenticated request cannot be forged from another origin.
	if (!request.headers.get("content-type")?.includes("application/json")) {
		return Response.json(
			{ error: "Expected an application/json request body" },
			{ status: 415 },
		);
	}

	const payload = await getPayload({ config: configPromise });
	const { user } = await payload.auth({ headers: request.headers });

	if (!user) {
		return Response.json({ error: "Authentication required" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const requestedIds = Array.isArray(body)
		? body
		: (body as { ids?: unknown } | null)?.ids;
	const { ids, error } = normalizeBulkRetranslateIds(requestedIds);

	if (error) {
		return Response.json({ error }, { status: 400 });
	}

	const outcomes = await retranslateReviews(payload, user, ids);

	return Response.json({ outcomes });
}
