import type { Payload } from "payload";
import { runTranslationPipeline } from "../hooks/translateReview";

/** Outcome of the admin "Re-translate now" action. */
export interface RetranslateResult {
	ok: boolean;
	httpStatus: 200 | 401 | 403 | 404;
	/** Final translation status after the pipeline ran (when ok). */
	translationStatus?: string;
	/** Failure details when the translation pipeline marked the review failed. */
	error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RetranslateUser = { id: number; role: string } | null | undefined;

/**
 * Admin "Re-translate now" core: authorization, then a full translation
 * pipeline run for any review regardless of draft/published state. This is an
 * explicit user action, so the per-review autoTranslate toggle is overridden.
 */
export async function retranslateReview(
	payload: Payload,
	user: RetranslateUser,
	id: number,
): Promise<RetranslateResult> {
	if (!user) {
		return { ok: false, httpStatus: 401, error: "Authentication required" };
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let doc: any;
	try {
		doc = await payload.findByID({ collection: "reviews", id, depth: 0 });
	} catch {
		return { ok: false, httpStatus: 404, error: "Review not found" };
	}

	// Admin may re-translate anything; writers only their own reviews.
	const authorId =
		typeof doc.author === "object" && doc.author !== null
			? doc.author.id
			: doc.author;
	const isAuthor = authorId === user.id;
	if (user.role !== "admin" && !isAuthor) {
		return { ok: false, httpStatus: 403, error: "Not authorized" };
	}

	// Explicit action: ignore the autoTranslate toggle entirely.
	await runTranslationPipeline(payload, doc);

	const updated = await payload.findByID({
		collection: "reviews",
		id,
		depth: 0,
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result: RetranslateResult = {
		ok: true,
		httpStatus: 200,
		translationStatus: (updated as any).translationStatus,
	};
	if ((updated as any).translationError) {
		result.error = (updated as any).translationError;
	}
	return result;
}
