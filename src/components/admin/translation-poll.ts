// Live translation-status polling helpers for the review edit view
// (FR-1 / FR-2). Pure logic — no React, no network — so the component keeps
// only wiring and the decision rules stay unit-testable.

/** Truncated length of an error toast, ellipsis included. */
export const TOAST_MAX_LENGTH = 140;

/** The subset of a REST review document the poller consumes. */
export interface TranslationStatusSnapshot {
	translationStatus: string;
	translationError?: string | null | undefined;
	translationUpdatedAt?: string | null | undefined;
}

/** One form-state entry, shaped for `dispatchFields({ type: "UPDATE_MANY" })`. */
export interface TranslationFieldPatchEntry {
	value: string;
	initialValue: string;
	valid: boolean;
}

/**
 * Form-state patch refreshing the visible translation fields. Dispatching
 * `value` equal to `initialValue` keeps the fields unmodified, so the poll
 * never marks the document as "changed by the author".
 */
export interface TranslationFieldPatch {
	translationStatus: TranslationFieldPatchEntry;
	translationError?: TranslationFieldPatchEntry;
	translationUpdatedAt?: TranslationFieldPatchEntry;
}

export type TranslationTransitionToast = {
	kind: "success" | "error";
	message: string;
} | null;

/**
 * Shorten a stored `translationError` (Phase 1 already makes it
 * author-actionable first, raw detail after) so the toast stays readable.
 */
export function truncateToastMessage(
	message: string | null | undefined,
	maxLength: number = TOAST_MAX_LENGTH,
): string {
	const trimmed = typeof message === "string" ? message.trim() : "";
	if (!trimmed) return "";
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, maxLength - 1)}…`;
}

/** Build the form-state patch that refreshes the sidebar translation fields. */
export function buildTranslationStatusPatch(
	status: string,
	detail: Pick<
		TranslationStatusSnapshot,
		"translationError" | "translationUpdatedAt"
	> = {},
): TranslationFieldPatch {
	const patch: TranslationFieldPatch = {
		translationStatus: patchEntry(status),
	};
	if (detail.translationUpdatedAt) {
		patch.translationUpdatedAt = patchEntry(detail.translationUpdatedAt);
	}
	// Failure shows the (already formatted) error; success clears it.
	if (status === "failed") {
		patch.translationError = patchEntry(detail.translationError ?? "");
	} else if (status === "translated") {
		patch.translationError = patchEntry("");
	}
	return patch;
}

/**
 * Decide what a poll participant should do with one fetched snapshot,
 * given the status the form currently shows.
 *
 * Returns `null` when there is nothing to do (no transition or an unknown
 * last-seen status — a poller that just mounted must not announce a
 * translation that finished at some point in the past). A transition out of
 * `pending` to `translated` / `failed` also produces a success / failure
 * toast; other transitions update the visible fields silently.
 *
 * Whether polling should stop is derived by the caller: poll only while the
 * visible status is `pending`.
 */
export function resolveTranslationTransition(params: {
	lastSeenStatus?: string | null | undefined;
	nextDoc: TranslationStatusSnapshot;
}): { toast: TranslationTransitionToast; patch: TranslationFieldPatch } | null {
	const nextStatus = params.nextDoc.translationStatus;
	if (!nextStatus) return null;
	if (!params.lastSeenStatus || params.lastSeenStatus === nextStatus) {
		return null;
	}
	let toast: TranslationTransitionToast = null;
	if (nextStatus === "translated") {
		toast = { kind: "success", message: "Translation completed" };
	} else if (nextStatus === "failed") {
		const message =
			truncateToastMessage(params.nextDoc.translationError) ||
			"Translation failed";
		toast = { kind: "error", message };
	}
	return {
		toast,
		patch: buildTranslationStatusPatch(nextStatus, params.nextDoc),
	};
}

function patchEntry(value: string): TranslationFieldPatchEntry {
	return { value, initialValue: value, valid: true };
}
