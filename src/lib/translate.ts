import { v2 } from "@google-cloud/translate";
import fs from "fs";
import path from "path";
import { env } from "./env";
import { logger } from "./logger";
import { getCachedTranslation, setCachedTranslation } from "./redis";
import {
	type CharacterReservation,
	countTranslationCharacters,
	reserveCharacters,
} from "./translation-budget";
import {
	classifyTranslationError,
	extractProviderErrorDetails,
	isRetryable,
	type TranslationErrorKind,
} from "./translation-errors";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimal structural view of a node in a serialized Lexical rich text
 * document as stored by Payload. Node payloads differ per node class, so
 * everything the pipeline does not act on stays `unknown` behind the index
 * signature and is narrowed at use sites (typeof / Array.isArray). Keeping
 * the shape index-signature-only is what makes the generated `Review` rich
 * text fields assignable in and the Payload local API `data` assignable out
 * without casts.
 */
interface RichTextNode {
	[key: string]: unknown;
}

/** Serialized Lexical editor state (the value of a Payload rich text field). */
interface RichTextDocument {
	root?: RichTextNode;
	[key: string]: unknown;
}

/**
 * Marker wrapped around every string the offline test-mode stub produces.
 *
 * The marker is what lets a test prove that a translation really happened
 * (and that it came from the stub, not from a cached provider answer):
 * `src/lib/__tests__/translate-test-mode.test.ts` asserts the marker, and
 * the browser specs look for it in the Indonesian locale of a re-translated
 * review.
 */
export const TRANSLATION_TEST_MODE_PREFIX = "[stub-id] ";
export const TRANSLATION_TEST_MODE_SUFFIX = " [/stub-id]";

/**
 * Whether the offline, deterministic translation stub is active.
 *
 * The only switch is the explicit `TRANSLATION_TEST_MODE=1` environment
 * flag. It is deliberately NOT gated on `NODE_ENV`: the e2e harness serves a
 * production build, so `NODE_ENV` is `production` there and cannot be used
 * as the gate. The deploy workflow never sets the flag, so production
 * traffic always reaches the real provider.
 */
export function isTranslationTestMode(): boolean {
	return process.env.TRANSLATION_TEST_MODE === "1";
}

/**
 * The offline stub: it wraps the source text in a marker instead of
 * translating it. It creates no client, reads no credentials and sends no
 * request.
 */
function translateWithTestModeStub(texts: string[]): string[] {
	return texts.map((text) =>
		text && text.trim() !== ""
			? `${TRANSLATION_TEST_MODE_PREFIX}${text}${TRANSLATION_TEST_MODE_SUFFIX}`
			: text,
	);
}

// Initialize client - handles both file-based and inline credentials.
// The client is memoized for the process lifetime: credential parsing is
// expensive and the client is stateless, so it is safe to reuse.
let cachedTranslateClient: v2.Translate | undefined;
const getTranslateClient = () => {
	if (cachedTranslateClient) {
		return cachedTranslateClient;
	}
	cachedTranslateClient = createTranslateClient();
	return cachedTranslateClient;
};

/**
 * Drops the memoized client.
 *
 * The memoization is per process, which is right at runtime but wrong for
 * tests: a test file that mocks the provider would otherwise reuse a client
 * another file built under its own mock, and its assertions would observe zero
 * calls on a client nobody uses. Test-only, same shape as
 * `clearTranslationLocksForTest`.
 */
export function resetTranslateClientForTest(): void {
	cachedTranslateClient = undefined;
}

const createTranslateClient = (): v2.Translate => {
	logger.info("[Translation] Initializing Google Cloud client...");

	// Option 1: Inline JSON credentials (for Docker/production)
	if (env.GOOGLE_CLOUD_CREDENTIALS) {
		logger.info("[Translation] Using inline credentials");

		let credentialsStr = env.GOOGLE_CLOUD_CREDENTIALS.trim();

		// Remove surrounding quotes if present (common issue with env vars)
		if (
			(credentialsStr.startsWith("'") && credentialsStr.endsWith("'")) ||
			(credentialsStr.startsWith('"') && credentialsStr.endsWith('"'))
		) {
			credentialsStr = credentialsStr.slice(1, -1);
		}

		// Handle double-escaped JSON (common with Docker build args)
		// If we see \" it means the JSON is escaped and needs to be unescaped
		if (credentialsStr.includes('\\"')) {
			logger.info("[Translation] Detected double-escaped JSON, unescaping...");
			credentialsStr = credentialsStr
				.replace(/\\"/g, '"')
				.replace(/\\\\/g, "\\");
		}

		try {
			const credentials = JSON.parse(credentialsStr);
			return new v2.Translate({
				credentials,
				projectId: env.GOOGLE_CLOUD_PROJECT_ID,
			});
		} catch (parseError) {
			logger.error(
				"[Translation] Failed to parse GOOGLE_CLOUD_CREDENTIALS:",
				parseError,
			);
			throw new Error(
				"Invalid GOOGLE_CLOUD_CREDENTIALS JSON format. Ensure the JSON is properly escaped in your environment variable.",
			);
		}
	}

	// Option 2: Credentials file path
	if (env.GOOGLE_APPLICATION_CREDENTIALS) {
		let credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS;

		// Resolve relative path to absolute
		if (!path.isAbsolute(credentialsPath)) {
			credentialsPath = path.resolve(process.cwd(), credentialsPath);
		}

		logger.info(`[Translation] Using credentials file: ${credentialsPath}`);

		// Check if file exists
		if (!fs.existsSync(credentialsPath)) {
			logger.error(
				`[Translation] ERROR: Credentials file not found at ${credentialsPath}`,
			);
			throw new Error(`Credentials file not found: ${credentialsPath}`);
		}

		// Read and parse credentials file
		const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));

		return new v2.Translate({
			credentials,
			projectId: env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
		});
	}

	logger.warn("[Translation] WARNING: No credentials configured!");
	return new v2.Translate({
		projectId: env.GOOGLE_CLOUD_PROJECT_ID,
	});
};

// Error thrown when a translation batch exhausts all retry attempts.
// Callers must treat this as a hard failure: the source text is NEVER a
// valid translation result.
export class TranslationError extends Error {
	attempts: number;

	constructor(
		message: string,
		options?: { attempts?: number; cause?: unknown },
	) {
		super(message, options ? { cause: options.cause } : undefined);
		this.name = "TranslationError";
		this.attempts = options?.attempts ?? 0;
	}
}

/**
 * Reason recorded when a translation run is stopped because its time budget
 * ran out. It is not a provider failure: it must never be classified as
 * transient and must never schedule the delayed automatic re-run.
 */
export const TRANSLATION_BUDGET_REASON = "translation time budget reached";

/**
 * Error thrown when a translation run is stopped by its deadline.
 *
 * The message deliberately avoids the patterns `classifyTranslationError`
 * matches for provider failures (timeout / network / quota): the classifier
 * maps it to "unexpected", which is not transient, so a budget stop never
 * schedules the automatic re-run.
 */
export class TranslationBudgetError extends TranslationError {
	constructor(message: string = TRANSLATION_BUDGET_REASON) {
		super(message);
		this.name = "TranslationBudgetError";
	}
}

/**
 * Reason reported when a run is stopped because the rolling character budget
 * could not be reserved inside its bounded wait.
 *
 * It is a budget stop, not a provider failure: it is never retried and never
 * schedules the automatic re-run. The wording deliberately avoids the patterns
 * `classifyTranslationError` matches for provider failures, so nothing can
 * mistake it for a quota or timeout response.
 */
export const TRANSLATION_CHARACTER_BUDGET_REASON =
	"translation character budget reached";

// Maximum number of strings sent in a single Google Translate API request.
// This is a secondary ceiling: a request is packed by character count first,
// so a batch of short strings still stops at this count.
export const TRANSLATION_BATCH_SIZE = 64;

// Google's recommended maximum of code points per request. A request closes as
// soon as it reaches this many, which keeps a burst of rich-text nodes from
// becoming one huge request that drains the character quota in a single call.
export const TRANSLATION_BATCH_CHAR_TARGET = 5000;

// Hard ceiling on code points per request. It sits well under the API's 30,000
// limit so that a text slightly over the target can never push a request past
// what Google accepts. Only a single text longer than this travels alone.
export const TRANSLATION_BATCH_CHAR_CAP = 25000;

/** Default per-request timeout for a single translation API call (ms). */
export const TRANSLATION_REQUEST_TIMEOUT_MS = 30 * 1000;

// Exponential backoff schedule between retry attempts (~2s -> ~8s -> ~30s).
export const RETRY_DELAYS_MS = [2000, 8000, 30000];

// Retry policy shared with the lock TTL: the TTL is derived from these, so
// they must stay exported and must not be restated as literals elsewhere.
export const MAX_ATTEMPTS = 3;

/**
 * Ceiling on the raw detail kept in a failed-attempt log line.
 *
 * The detail is a diagnostic tail, not a payload: a few hundred characters
 * keeps the stack — occasionally the only clue — without turning one failure
 * into a screenful of noise.
 */
const MAX_LOG_DETAIL_LENGTH = 400;

export type TranslateBatchOptions = {
	/** Backoff delays (ms) between retry attempts. Defaults to RETRY_DELAYS_MS. */
	delays?: number[];
	/**
	 * Max strings per API request. Defaults to TRANSLATION_BATCH_SIZE. A
	 * request also stops at TRANSLATION_BATCH_CHAR_TARGET code points, so this
	 * is the string ceiling of a batch, not its only limit.
	 */
	batchSize?: number;
	/**
	 * Per-request timeout (ms). Defaults to TRANSLATION_REQUEST_TIMEOUT_MS.
	 * Capped by the remaining time when a deadline is set.
	 */
	timeoutMs?: number;
	/**
	 * Epoch-ms deadline. Before every attempt the run stops when the
	 * deadline has passed, the backoff never sleeps past it, and a request
	 * that would outlive it is cut short.
	 */
	deadline?: number;
};

function backoffDelay(delays: number[], attempt: number): number {
	if (delays.length === 0) return 0;
	return delays[Math.min(attempt, delays.length - 1)];
}

// The request timed out. Distinct from a provider failure so a timeout that
// was cut by the deadline can be told apart from a real API error.
class TranslationRequestTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TranslationRequestTimeoutError";
	}
}

// Helper to add timeout to a promise
function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	errorMessage: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new TranslationRequestTimeoutError(errorMessage)),
			ms,
		);
	});
	return Promise.race([promise, timeout]).finally(() => {
		// The timer must not outlive the request it guards.
		if (timer) clearTimeout(timer);
	});
}

/**
 * The provider's own failure, rethrown as a TranslationError.
 *
 * A deadline can stop the run, but it is never the reason the translation
 * failed: the provider error is. The original error is kept as the `cause`,
 * so the raw detail is never lost and the classifier still sees the quota /
 * credentials / network signal it needs to decide whether the failure is
 * transient.
 */
function providerFailure(error: unknown, attempts: number): TranslationError {
	const message =
		error instanceof Error && error.message
			? error.message
			: "Translation failed";
	return new TranslationError(message, { attempts, cause: error });
}

/**
 * A bounded, printable summary of a failed attempt.
 *
 * Deliberately a string and never the error object: a Google `ApiError` holds
 * its HTTP response as a `Gunzip` stream, and passing it to `console.error`
 * makes Node's `util.inspect` walk that stream into dozens of lines of
 * `_readableState` / `_writeState` internals, burying the one field that says
 * what happened.
 */
function summarizeErrorDetail(error: unknown): string {
	let detail: string;
	if (error instanceof Error) {
		detail = error.stack ?? error.message;
	} else if (typeof error === "string") {
		detail = error;
	} else {
		detail = String(error);
	}
	return detail.length > MAX_LOG_DETAIL_LENGTH
		? `${detail.slice(0, MAX_LOG_DETAIL_LENGTH)}…`
		: detail;
}

/**
 * Log one failed provider attempt as structured fields.
 *
 * The line must be readable on its own: `kind` and `reason` say what failed,
 * `characters` and `texts` say what it cost, `attempt` says how much of the
 * retry budget it used, and `remainingBudget` (when the budget answered) says
 * whether there was capacity left to try again.
 */
function logAttemptFailure(input: {
	attempt: number;
	kind: TranslationErrorKind;
	texts: number;
	characters: number;
	remainingBudget?: number;
	error: unknown;
}): void {
	const { code, reason } = extractProviderErrorDetails(input.error);
	logger.error(
		`[Translation] Attempt ${input.attempt}/${MAX_ATTEMPTS} failed (${input.kind}) for batch of ${input.texts}:`,
		{
			kind: input.kind,
			code: code ?? null,
			reason: reason ?? null,
			characters: input.characters,
			texts: input.texts,
			attempt: input.attempt,
			remainingBudget: input.remainingBudget ?? null,
			retryable: isRetryable(input.kind),
			detail: summarizeErrorDetail(input.error),
		},
	);
}

// Translate one chunk of texts with retries and exponential backoff.
// Throws TranslationError after MAX_ATTEMPTS failed attempts.
// When a deadline is set the run stops at the deadline: no further attempt is
// started, the backoff never sleeps past it, and a request that would outlive
// it is cut short. A deadline stop throws TranslationBudgetError — it is not a
// provider failure. A provider failure stays a provider failure whatever the
// remaining time is: the deadline only prevents the retry, it never hides the
// reason the translation failed.
async function translateChunkWithRetry(
	texts: string[],
	targetLanguage: string,
	delays: number[],
	options?: TranslateBatchOptions,
): Promise<string[]> {
	const client = getTranslateClient();
	const deadline = options?.deadline;
	const requestTimeoutMs = options?.timeoutMs ?? TRANSLATION_REQUEST_TIMEOUT_MS;
	// Every attempt sends the same characters, so every attempt spends budget.
	const characters = countTranslationCharacters(texts);
	let lastError: unknown;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (deadline !== undefined && Date.now() >= deadline) {
			// The deadline stopped the run before this attempt started. When
			// an earlier attempt already failed, that provider failure is the
			// real cause of the stop and is reported as such — the deadline
			// only prevented the retry.
			if (lastError !== undefined) {
				throw providerFailure(lastError, attempt);
			}
			throw new TranslationBudgetError();
		}

		// The characters this attempt is about to send are accounted for
		// before the request goes out. A request that would overflow the
		// rolling window waits for the window to roll forward instead of
		// spending an exhausted allowance. A refused reservation stops the
		// run without sending anything. What is left of the window is kept for
		// the failure log below, where it says whether a retry had room.
		//
		// A refusal is a budget stop only when nothing has failed yet. When an
		// earlier attempt already failed, that provider failure is the real
		// cause of the stop — the budget only prevented the retry — exactly as
		// in the deadline check above.
		let remainingBudget: number | undefined;
		try {
			remainingBudget = await reserveChunkBudget(characters, options);
		} catch (error) {
			if (error instanceof TranslationBudgetError && lastError !== undefined) {
				throw providerFailure(lastError, attempt);
			}
			throw error;
		}

		if (deadline !== undefined && Date.now() >= deadline) {
			// The wait for the window used up the remaining time. The deadline
			// stopped the run, but it is never the reason the translation
			// failed: an earlier provider failure is, and it is reported as
			// such.
			if (lastError !== undefined) {
				throw providerFailure(lastError, attempt);
			}
			throw new TranslationBudgetError();
		}

		// The request must never outlive the deadline.
		const remainingMs =
			deadline === undefined ? undefined : deadline - Date.now();
		const timeoutMs =
			remainingMs === undefined
				? requestTimeoutMs
				: Math.min(requestTimeoutMs, Math.max(remainingMs, 0));
		const budgetLimited =
			remainingMs !== undefined && remainingMs < requestTimeoutMs;

		try {
			const [rawTranslations] = await withTimeout(
				client.translate(texts, targetLanguage),
				timeoutMs,
				budgetLimited
					? TRANSLATION_BUDGET_REASON
					: `Translation request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
			);
			const translations = rawTranslations as string[];
			if (
				!Array.isArray(translations) ||
				translations.length !== texts.length
			) {
				throw new Error(
					`Translation API returned ${translations?.length ?? 0} results for ${texts.length} inputs`,
				);
			}
			return translations;
		} catch (error) {
			lastError = error;
			// A request that was cut by the deadline is a budget stop, not a
			// provider failure. Any other error — even a quota error — is a
			// provider failure, whatever the remaining time is.
			if (error instanceof TranslationRequestTimeoutError && budgetLimited) {
				throw new TranslationBudgetError();
			}
			const classified = classifyTranslationError(error);
			logAttemptFailure({
				attempt: attempt + 1,
				kind: classified.kind,
				texts: texts.length,
				characters,
				remainingBudget,
				error,
			});
			// A non-retryable classification ends the chunk here, after exactly
			// one provider attempt: a quota window cannot roll forward inside a
			// backoff and a rejected credential never heals, so a retry would
			// only spend against an allowance that is already gone. The failure
			// is still the provider's own — same TranslationError shape, same
			// cause — so the stored error and the delayed re-run are unchanged.
			if (!isRetryable(classified.kind)) {
				throw providerFailure(error, attempt + 1);
			}
			if (attempt < MAX_ATTEMPTS - 1) {
				let delay = backoffDelay(delays, attempt);
				if (deadline !== undefined) {
					const remaining = deadline - Date.now();
					if (remaining <= 0) {
						// No time left for another attempt: the provider
						// failure is the real cause of the stop and is
						// reported as such.
						throw providerFailure(error, attempt + 1);
					}
					// Never sleep past the deadline.
					delay = Math.min(delay, remaining);
				}
				await sleep(delay);
			}
		}
	}

	throw new TranslationError(
		`Translation failed after ${MAX_ATTEMPTS} attempts`,
		{ attempts: MAX_ATTEMPTS, cause: lastError },
	);
}

/**
 * Counts Unicode code points, the unit Google measures its character quota in.
 *
 * `String.length` counts UTF-16 code units, so it over-counts astral characters
 * (emoji, some CJK extensions) and would close a batch early. Over-counting is
 * safe, under-counting is not, so the exact count is what the packer uses.
 */
function countCodePoints(text: string): number {
	return [...text].length;
}

/**
 * Packs cache-miss texts into provider requests by code-point count.
 *
 * A request closes as soon as it reaches the character target or the string
 * ceiling, whichever comes first, so the number of strings in a batch can never
 * make a request exceed the cap on its own. A single text longer than the cap
 * cannot be split without corrupting the sentence Google translates, so it is
 * packed alone in its own request instead.
 *
 * The input order is preserved: batches are consecutive runs of the given
 * texts, which is what lets the caller map results back onto the source order.
 */
function packTranslationRequests(
	texts: string[],
	charTarget: number,
	charCap: number,
	batchSize: number,
): string[][] {
	const batches: string[][] = [];
	let current: string[] = [];
	let currentChars = 0;

	const close = () => {
		if (current.length > 0) {
			batches.push(current);
			current = [];
			currentChars = 0;
		}
	};

	for (const text of texts) {
		const chars = countCodePoints(text);
		// An oversized text starts its own request rather than being split.
		const oversized = chars > charCap;
		const wouldOverflow =
			currentChars + chars > charTarget || current.length + 1 > batchSize;

		if (current.length > 0 && (oversized || wouldOverflow)) {
			close();
		}

		current.push(text);
		currentChars += chars;

		if (currentChars >= charTarget || current.length >= batchSize) {
			close();
		}
	}

	close();
	return batches;
}

/**
 * Reserve the characters one provider attempt is about to spend.
 *
 * Called after the cache misses are resolved, so a cache hit — which sends
 * nothing — consumes nothing. When the rolling window is full the reservation
 * waits for it to roll forward (bounded) and only then does the request reach
 * the provider.
 *
 * A reservation that cannot be granted is a deliberate stop at this layer: it
 * throws TranslationBudgetError, which is never retried and never schedules
 * the automatic re-run. Whether that stop is what the caller reports depends on
 * what came before it — `translateChunkWithRetry` rethrows an earlier provider
 * failure instead when there is one. Any failure of the budget machinery itself
 * is logged and the request proceeds, so accounting can never break a
 * translation run (and therefore never block a review save).
 *
 * Returns what is left of the rolling window after the reservation, or
 * `undefined` when the budget could not answer — the caller reports it in the
 * failure log when a retry has to be decided.
 */
async function reserveChunkBudget(
	characters: number,
	options?: TranslateBatchOptions,
): Promise<number | undefined> {
	const deadline = options?.deadline;

	let reservation: CharacterReservation;
	try {
		reservation = await reserveCharacters(
			characters,
			deadline === undefined
				? {}
				: // A deferred reservation must never outlive the run's deadline.
					{ maxWaitMs: Math.max(0, deadline - Date.now()) },
		);
	} catch (error) {
		logger.error(
			"[Translation] Character budget check failed; sending the request unreserved:",
			{ detail: summarizeErrorDetail(error) },
		);
		return undefined;
	}

	if (!reservation.granted) {
		throw new TranslationBudgetError(TRANSLATION_CHARACTER_BUDGET_REASON);
	}
	return reservation.remaining;
}

// Translate a list of texts using batched API calls, Redis caching, and
// retry with exponential backoff. Blank texts pass through untouched and
// are never sent to the API. On total failure this throws TranslationError -
// it never returns the source text as a "translation".
//
// With TRANSLATION_TEST_MODE=1 the provider path is replaced by the offline
// stub (see isTranslationTestMode).
export async function translateBatch(
	texts: string[],
	targetLanguage: string = "id",
	options?: TranslateBatchOptions,
): Promise<string[]> {
	if (texts.length === 0) return [];

	// The offline stub replaces the whole provider path: no client is
	// created, no credentials are read and no request is sent. It also
	// bypasses the translation cache in both directions - caching stub
	// output under the real cache key would poison a later genuine
	// translation of the same text.
	if (isTranslationTestMode()) {
		return translateWithTestModeStub(texts);
	}

	const delays = options?.delays ?? RETRY_DELAYS_MS;
	const batchSize = options?.batchSize ?? TRANSLATION_BATCH_SIZE;

	// Group non-blank texts by uniqueness, remembering every original index.
	const uniqueToIndices = new Map<string, number[]>();
	for (let i = 0; i < texts.length; i++) {
		const text = texts[i];
		if (!text || text.trim() === "") continue;
		const indices = uniqueToIndices.get(text);
		if (indices) {
			indices.push(i);
		} else {
			uniqueToIndices.set(text, [i]);
		}
	}

	// Resolve from cache first; only cache misses hit the API.
	const translatedFor = new Map<string, string>();
	const misses: string[] = [];
	for (const text of uniqueToIndices.keys()) {
		const cached = await getCachedTranslation(text, targetLanguage);
		if (cached) {
			translatedFor.set(text, cached);
		} else {
			misses.push(text);
		}
	}

	// Translate cache misses in character-packed requests, retrying each on
	// failure. Cache hits never reach this point, so they consume no capacity
	// and reserve no characters from the rolling budget.
	const batches = packTranslationRequests(
		misses,
		TRANSLATION_BATCH_CHAR_TARGET,
		TRANSLATION_BATCH_CHAR_CAP,
		batchSize,
	);
	for (const chunk of batches) {
		const chunkTranslations = await translateChunkWithRetry(
			chunk,
			targetLanguage,
			delays,
			options,
		);
		for (let j = 0; j < chunk.length; j++) {
			const source = chunk[j];
			const translated = chunkTranslations[j];
			translatedFor.set(source, translated);
			await setCachedTranslation(source, targetLanguage, translated);
		}
	}

	// Reassemble in the original order.
	return texts.map((text) => {
		if (!text || text.trim() === "") return text;
		return translatedFor.get(text) as string;
	});
}

// Translate a single string. Throws TranslationError on failure (no
// English fallback). Blank input passes through unchanged.
export async function translateText(
	text: string,
	targetLanguage: string = "id",
	options?: TranslateBatchOptions,
): Promise<string> {
	if (!text || text.trim() === "") return text;
	const [translation] = await translateBatch([text], targetLanguage, options);
	return translation;
}

// Extract plain text from Lexical editor JSON
export function extractPlainText(
	richText: RichTextDocument | null | undefined,
): string {
	const children = richText?.root?.children;
	if (!Array.isArray(children)) return "";

	const extractFromNode = (node: RichTextNode): string => {
		if (typeof node.text === "string") return node.text;
		if (Array.isArray(node.children)) {
			return node.children.map(extractFromNode).join("");
		}
		return "";
	};

	return children.map(extractFromNode).join("\n").trim();
}

// Create a simple Lexical rich text structure from plain text
export function createRichTextFromPlain(text: string): RichTextDocument {
	return {
		root: {
			type: "root",
			children: text.split("\n").map((paragraph) => ({
				type: "paragraph",
				children: [{ type: "text", text: paragraph, version: 1 }],
				direction: "ltr",
				format: "",
				indent: 0,
				version: 1,
			})),
			direction: "ltr",
			format: "",
			indent: 0,
			version: 1,
		},
	};
}

// Translate rich text while preserving the Lexical structure.
// Collects every text node, translates them in batched API calls, then maps
// results back onto the structure. Throws TranslationError on failure -
// it never returns the original English rich text as a "translation".
export function translateRichText(
	richText: RichTextDocument,
	targetLanguage?: string,
	options?: TranslateBatchOptions,
): Promise<RichTextDocument>;
export function translateRichText(
	richText: RichTextDocument | null | undefined,
	targetLanguage?: string,
	options?: TranslateBatchOptions,
): Promise<RichTextDocument | null | undefined>;
export async function translateRichText(
	richText: RichTextDocument | null | undefined,
	targetLanguage: string = "id",
	options?: TranslateBatchOptions,
): Promise<RichTextDocument | null | undefined> {
	if (!richText?.root) return richText;

	// Collect all text nodes in document order.
	const texts: string[] = [];
	const collect = (node: RichTextNode): void => {
		if (node.type === "text" && typeof node.text === "string" && node.text) {
			texts.push(node.text);
		}
		if (Array.isArray(node.children)) {
			node.children.forEach(collect);
		}
	};
	collect(richText.root);

	if (texts.length === 0) return richText;

	const translations = await translateBatch(texts, targetLanguage, options);

	// Map translations back onto the structure in the same order.
	let textIndex = 0;
	const apply = (node: RichTextNode): RichTextNode => {
		if (node.type === "text" && typeof node.text === "string" && node.text) {
			return {
				...node,
				text: translations[textIndex++],
			};
		}
		if (Array.isArray(node.children)) {
			return {
				...node,
				children: node.children.map(apply),
			};
		}
		return node;
	};

	return { root: apply(richText.root) };
}

// Sync rich text format from source to target while preserving target's text content
// Used when only formatting changed (not text) - avoids re-translation
export function syncRichTextFormat(
	sourceRichText: RichTextDocument, // New version (source of structure/format)
	targetRichText: RichTextDocument | null | undefined, // Existing translated version (source of text)
): RichTextDocument;
export function syncRichTextFormat(
	sourceRichText: RichTextDocument | null | undefined, // New version (source of structure/format)
	targetRichText: RichTextDocument | null | undefined, // Existing translated version (source of text)
): RichTextDocument | null | undefined;
export function syncRichTextFormat(
	sourceRichText: RichTextDocument | null | undefined, // New version (source of structure/format)
	targetRichText: RichTextDocument | null | undefined, // Existing translated version (source of text)
): RichTextDocument | null | undefined {
	if (!sourceRichText?.root) return sourceRichText;
	if (!targetRichText?.root) return sourceRichText;

	// Collect all text nodes from target in order
	const collectTextNodes = (node: RichTextNode): string[] => {
		if (node.type === "text" && typeof node.text === "string" && node.text) {
			return [node.text];
		}
		if (Array.isArray(node.children)) {
			return node.children.flatMap(collectTextNodes);
		}
		return [];
	};

	const targetTexts = collectTextNodes(targetRichText.root);
	let textIndex = 0;

	// Apply source structure but use target's text content
	const syncNode = (node: RichTextNode): RichTextNode => {
		if (node.type === "text" && typeof node.text === "string" && node.text) {
			// Use translated text from target if available
			const translatedText = targetTexts[textIndex] ?? node.text;
			textIndex++;
			return {
				...node,
				text: translatedText,
			};
		}

		if (Array.isArray(node.children)) {
			return {
				...node,
				children: node.children.map(syncNode),
			};
		}

		return node;
	};

	try {
		const syncedRoot = syncNode(sourceRichText.root);
		return { root: syncedRoot };
	} catch (error) {
		logger.error("[Translation] Failed to sync rich text format:", error);
		return sourceRichText;
	}
}
