import { v2 } from "@google-cloud/translate";
import fs from "fs";
import path from "path";
import { env } from "./env";
import { logger } from "./logger";
import { getCachedTranslation, setCachedTranslation } from "./redis";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Initialize client - handles both file-based and inline credentials
const getTranslateClient = () => {
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

// Maximum number of strings sent in a single Google Translate API request.
export const TRANSLATION_BATCH_SIZE = 64;

// Exponential backoff schedule between retry attempts (~2s -> ~8s -> ~30s).
export const RETRY_DELAYS_MS = [2000, 8000, 30000];

const MAX_ATTEMPTS = 3;

type TranslateBatchOptions = {
	/** Backoff delays (ms) between retry attempts. Defaults to RETRY_DELAYS_MS. */
	delays?: number[];
	/** Max strings per API request. Defaults to TRANSLATION_BATCH_SIZE. */
	batchSize?: number;
};

function backoffDelay(delays: number[], attempt: number): number {
	if (delays.length === 0) return 0;
	return delays[Math.min(attempt, delays.length - 1)];
}

// Helper to add timeout to a promise
function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	errorMessage: string,
): Promise<T> {
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error(errorMessage)), ms);
	});
	return Promise.race([promise, timeout]);
}

// Translate one chunk of texts with retries and exponential backoff.
// Throws TranslationError after MAX_ATTEMPTS failed attempts.
async function translateChunkWithRetry(
	texts: string[],
	targetLanguage: string,
	delays: number[],
): Promise<string[]> {
	const client = getTranslateClient();
	let lastError: unknown;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		try {
			const [rawTranslations] = await withTimeout(
				client.translate(texts, targetLanguage),
				30000,
				"Translation request timed out after 30 seconds",
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
			logger.error(
				`[Translation] Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed for batch of ${texts.length}:`,
				error,
			);
			if (attempt < MAX_ATTEMPTS - 1) {
				await sleep(backoffDelay(delays, attempt));
			}
		}
	}

	throw new TranslationError(
		`Translation failed after ${MAX_ATTEMPTS} attempts`,
		{ attempts: MAX_ATTEMPTS, cause: lastError },
	);
}

// Translate a list of texts using batched API calls, Redis caching, and
// retry with exponential backoff. Blank texts pass through untouched and
// are never sent to the API. On total failure this throws TranslationError -
// it never returns the source text as a "translation".
export async function translateBatch(
	texts: string[],
	targetLanguage: string = "id",
	options?: TranslateBatchOptions,
): Promise<string[]> {
	if (texts.length === 0) return [];

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

	// Translate cache misses in chunks, retrying each chunk on failure.
	for (let start = 0; start < misses.length; start += batchSize) {
		const chunk = misses.slice(start, start + batchSize);
		const chunkTranslations = await translateChunkWithRetry(
			chunk,
			targetLanguage,
			delays,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractPlainText(richText: any): string {
	if (!richText?.root?.children) return "";

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const extractFromNode = (node: any): string => {
		if (node.text) return node.text;
		if (node.children) {
			return node.children.map(extractFromNode).join("");
		}
		return "";
	};

	return richText.root.children.map(extractFromNode).join("\n").trim();
}

// Create a simple Lexical rich text structure from plain text
export function createRichTextFromPlain(text: string): object {
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
export async function translateRichText(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	richText: any,
	targetLanguage: string = "id",
	options?: TranslateBatchOptions,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	if (!richText?.root) return richText;

	// Collect all text nodes in document order.
	const texts: string[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const collect = (node: any): void => {
		if (node.type === "text" && node.text) {
			texts.push(node.text);
		}
		if (node.children && Array.isArray(node.children)) {
			node.children.forEach(collect);
		}
	};
	collect(richText.root);

	if (texts.length === 0) return richText;

	const translations = await translateBatch(texts, targetLanguage, options);

	// Map translations back onto the structure in the same order.
	let textIndex = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const apply = (node: any): any => {
		if (node.type === "text" && node.text) {
			return {
				...node,
				text: translations[textIndex++],
			};
		}
		if (node.children && Array.isArray(node.children)) {
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sourceRichText: any, // New version (source of structure/format)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	targetRichText: any, // Existing translated version (source of text)
): object {
	if (!sourceRichText?.root) return sourceRichText;
	if (!targetRichText?.root) return sourceRichText;

	// Collect all text nodes from target in order
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const collectTextNodes = (node: any): string[] => {
		if (node.type === "text" && node.text) {
			return [node.text];
		}
		if (node.children && Array.isArray(node.children)) {
			return node.children.flatMap(collectTextNodes);
		}
		return [];
	};

	const targetTexts = collectTextNodes(targetRichText.root);
	let textIndex = 0;

	// Apply source structure but use target's text content
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const syncNode = (node: any): any => {
		if (node.type === "text" && node.text) {
			// Use translated text from target if available
			const translatedText = targetTexts[textIndex] ?? node.text;
			textIndex++;
			return {
				...node,
				text: translatedText,
			};
		}

		if (node.children && Array.isArray(node.children)) {
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
