// Error classification for the translation pipeline.
// Maps the raw failures produced by the Google Cloud Translate client
// (ApiError codes/messages), network stacks, and our own TranslationError
// wrapper onto a small set of kinds, each carrying an author-actionable
// message. The raw technical detail is always preserved alongside so
// debugging never loses information.
//
// Pure logic — no Payload, Redis, or network dependencies — so it stays
// fully unit-testable.

export const TRANSLATION_ERROR_KINDS = [
	"quota",
	"network",
	"timeout",
	"credentials",
	"unexpected",
] as const;

export type TranslationErrorKind = (typeof TRANSLATION_ERROR_KINDS)[number];

export interface ClassifiedTranslationError {
	kind: TranslationErrorKind;
	/** Author-actionable message: what happened and what to do next. */
	message: string;
	/** Preserved raw technical detail (cause chain joined with ": "). */
	raw: string;
	/** Transient kinds qualify for the single automatic delayed re-run. */
	transient: boolean;
}

const ACTIONABLE_MESSAGES: Record<TranslationErrorKind, string> = {
	quota:
		"Translation quota exceeded. Wait a few minutes before retrying, or check your Google Cloud Translation API quota and billing.",
	network:
		"Translation service could not be reached. Check the server's network connection and retry; if it keeps failing, verify the Google Cloud Translation API is reachable from your host.",
	timeout:
		"Translation request timed out. Retry the translation; if timeouts persist, check the Google Cloud status page or your network.",
	credentials:
		"Translation credentials are invalid or lack permission. Verify GOOGLE_CLOUD_CREDENTIALS / GOOGLE_APPLICATION_CREDENTIALS and that the service account has the Cloud Translation API roles enabled.",
	unexpected:
		"Translation failed for an unexpected reason. Retry the translation; if it keeps failing, check the server logs for the raw error below.",
};

const TRANSIENT_KINDS: readonly TranslationErrorKind[] = [
	"quota",
	"network",
	"timeout",
];

// Google ApiError-like shape: numeric `code` (HTTP status) plus `message`.
interface ApiErrorLike {
	code?: unknown;
	message?: unknown;
}

const QUOTA_MESSAGE_PATTERN =
	/quota|resource[_\s-]?exhausted|rate[_\s-]?limit/i;
const TIMEOUT_MESSAGE_PATTERN = /timed?\s*-?\s*out|deadline|ETIMEDOUT|ABORTED/i;
const NETWORK_MESSAGE_PATTERN =
	/ENOTFOUND|ECONNREFUSED|ECONNRESET|ECONNABORTED|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|getaddrinfo|socket hang up|network/i;
const CREDENTIALS_MESSAGE_PATTERN =
	/credential|unauthorized|unauthenticated|invalid[_\s-]?api[_\s-]?key|api[_\s-]?key[_\s-]?not[_\s-]?valid|permission denied|forbidden|401/i;

function isApiErrorLike(error: unknown): error is ApiErrorLike {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as { code?: unknown };
	return typeof candidate.code === "number";
}

function isQuotaMessage(message: string): boolean {
	return QUOTA_MESSAGE_PATTERN.test(message);
}

function isTimeoutMessage(message: string): boolean {
	return TIMEOUT_MESSAGE_PATTERN.test(message);
}

function isNetworkMessage(message: string): boolean {
	return NETWORK_MESSAGE_PATTERN.test(message);
}

function isCredentialsMessage(message: string): boolean {
	return CREDENTIALS_MESSAGE_PATTERN.test(message);
}

/**
 * Classify a single error node (not the cause chain) into a kind, or null
 * when nothing in this node matches a known class.
 */
function classifySingleNode(error: unknown): TranslationErrorKind | null {
	const message = extractNodeMessage(error);

	if (isApiErrorLike(error)) {
		const code = error.code;
		if (code === 429) return "quota";
		if (code === 401) return "credentials";
		if (code === 403) return isQuotaMessage(message) ? "quota" : "credentials";
		if (code === 408 || code === 504) return "timeout";
		if (code === 500 || code === 502 || code === 503) return "network";
	}

	if (!message) return null;
	if (isQuotaMessage(message)) return "quota";
	if (isTimeoutMessage(message)) return "timeout";
	if (isNetworkMessage(message)) return "network";
	if (isCredentialsMessage(message)) return "credentials";
	return null;
}

/** Best-effort human-readable message for one error node. */
function extractNodeMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error.trim()) return error;
	// ApiError-like plain objects carry `message` without being Error instances.
	if (
		typeof error === "object" &&
		error !== null &&
		typeof (error as { message?: unknown }).message === "string"
	) {
		const message = (error as { message: string }).message;
		if (message.trim()) return message;
	}
	return "";
}

/**
 * Walk the error and its `cause` chain from outermost to innermost,
 * returning every non-empty message in order.
 */
function collectErrorMessages(error: unknown): string[] {
	const messages: string[] = [];
	const seen = new Set<unknown>();
	let current: unknown = error;
	while (
		typeof current === "object" &&
		current !== null &&
		!seen.has(current)
	) {
		seen.add(current);
		const message = extractNodeMessage(current);
		if (message && !messages.includes(message)) messages.push(message);
		const cause = (current as { cause?: unknown }).cause;
		current = cause === current ? undefined : cause;
	}
	if (typeof current === "string" && current.trim()) {
		messages.push(current);
	}
	return messages;
}

/**
 * Classify a thrown translation failure into a kind with an
 * author-actionable message, preserving the raw technical detail.
 *
 * The cause chain is walked from the outside in (TranslationError wrapper
 * → ApiError → transport error); the first node that matches a known
 * class wins, so a wrapper message never masks the underlying cause.
 */
export function classifyTranslationError(
	error: unknown,
): ClassifiedTranslationError {
	const messages = collectErrorMessages(error);
	const raw = messages.join(": ");

	let kind: TranslationErrorKind | null = null;
	for (const node of [error, ...collectCauses(error)]) {
		kind = classifySingleNode(node);
		if (kind) break;
	}

	// Fall back to pattern matching over the joined chain (handles thrown
	// strings and exotic error shapes without a `cause` link).
	if (!kind) {
		for (const message of messages) {
			kind = classifySingleNode(message);
			if (kind) break;
		}
	}
	if (!kind) kind = "unexpected";

	return {
		kind,
		message: ACTIONABLE_MESSAGES[kind],
		raw: raw || "Unknown translation error",
		transient: TRANSIENT_KINDS.includes(kind),
	};
}

/** Whether the failure is transient (quota/network/timeout) — i.e. eligible for the single automatic re-run. */
export function isTransientTranslationError(error: unknown): boolean {
	return classifyTranslationError(error).transient;
}

/**
 * Compose the string stored in the `translationError` field: the
 * author-actionable message first, the raw technical detail preserved
 * after it, e.g.
 * "Quota exceeded. Wait before retrying… (raw: Translation failed after 3 attempts: quota exceeded)".
 */
export function formatTranslationError(error: unknown): string {
	const classified = classifyTranslationError(error);
	return `${classified.message} (raw: ${classified.raw})`;
}

/** Collect the cause chain nodes (excluding the error itself), outermost first. */
function collectCauses(error: unknown): unknown[] {
	const causes: unknown[] = [];
	const seen = new Set<unknown>([error]);
	let current = error;
	while (current !== null && current !== undefined) {
		const cause =
			typeof current === "object"
				? (current as { cause?: unknown }).cause
				: undefined;
		if (cause === undefined || cause === null || seen.has(cause)) break;
		seen.add(cause);
		causes.push(cause);
		current = cause;
	}
	return causes;
}
