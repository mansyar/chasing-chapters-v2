// Translation status tracking for the bilingual pipeline.
// Pure logic — no Payload or Redis dependencies — so it stays fully unit-testable.

export const TRANSLATION_STATUSES = [
	"untranslated",
	"pending",
	"translated",
	"failed",
	"stale",
] as const;

export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

type TransitionMap = Record<TranslationStatus, readonly TranslationStatus[]>;

const VALID_TRANSITIONS: TransitionMap = {
	untranslated: ["pending", "translated"],
	pending: ["translated", "failed"],
	translated: ["pending", "stale"],
	failed: ["pending"],
	stale: ["pending", "translated"],
};

export function canTransition(
	from: TranslationStatus,
	to: TranslationStatus,
): boolean {
	if (!TRANSLATION_STATUSES.includes(from)) return false;
	if (!TRANSLATION_STATUSES.includes(to)) return false;
	return VALID_TRANSITIONS[from].includes(to);
}

/**
 * A translation is stale when it does not exist yet, or when the English
 * document was edited after the translation was last updated.
 */
export function isStale(
	englishUpdatedAt: string | Date | null | undefined,
	translationUpdatedAt: string | Date | null | undefined,
): boolean {
	const english = parseDate(englishUpdatedAt);
	const translation = parseDate(translationUpdatedAt);
	if (!translation) return true;
	if (!english) return true;
	return english.getTime() > translation.getTime();
}

export interface FailedStatus {
	status: "failed";
	error: string;
	attempts: number;
}

export function createFailedStatus(
	error: unknown,
	attempts: number,
): FailedStatus {
	return {
		status: "failed",
		error: extractErrorMessage(error),
		attempts,
	};
}

export function describeFailure(error: unknown, attempts: number): string {
	return `${extractErrorMessage(error)} (after ${attempts} ${attempts === 1 ? "attempt" : "attempts"})`;
}

function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string" && error.trim()) return error;
	return "Unknown translation error";
}

function parseDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
