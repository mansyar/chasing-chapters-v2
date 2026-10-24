import type { Validate } from "payload";

/** A node of a serialized Lexical editor state, as far as this check reads it. */
interface EditorNode {
	children?: unknown;
	text?: unknown;
	type?: unknown;
}

/** Whether a single node carries no text, including everything beneath it. */
const isTextlessNode = (node: unknown): boolean => {
	if (typeof node !== "object" || node === null) {
		return true;
	}

	const { children, text, type } = node as EditorNode;

	if (type === "text") {
		return typeof text !== "string" || text.trim().length === 0;
	}

	if (!Array.isArray(children)) {
		return true;
	}

	return children.every(isTextlessNode);
};

/**
 * Whether a serialized Lexical editor state carries any text.
 *
 * Mirrors `hasText` from `@payloadcms/richtext-lexical`, which Payload's own
 * rich-text validator runs: a value whose root has no children, or whose nodes
 * are only empty paragraphs and empty text nodes, is textless. It is
 * reimplemented rather than imported because the package entry pulls the
 * editor's client code into a module that is loaded on the server. Whitespace
 * counts as empty here, the same way it does for the string branch below.
 */
const hasText = (value: unknown): boolean => {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const { children } = (value as { root?: EditorNode }).root ?? {};

	if (!Array.isArray(children) || children.length === 0) {
		return false;
	}

	return !children.every(isTextlessNode);
};

/**
 * Whether a localized value counts as absent.
 *
 * A `text` and a `richText` field reach this validator with different shapes:
 * a string, or a serialized editor state whose text lives in its nodes.
 */
const isBlank = (value: unknown): boolean => {
	if (value === undefined || value === null) {
		return true;
	}

	if (typeof value === "string") {
		return value.trim().length === 0;
	}

	if (typeof value === "object") {
		return !hasText(value);
	}

	return false;
};

/**
 * Requires a localized field's value in the default locale only (`FR-10`).
 *
 * Payload reads `required` on a localized field as "required in every locale",
 * which makes a partial translation write impossible: the translation pipeline
 * writes the Indonesian body and deliberately never the title, and Payload
 * then rejects the write with "The following field is invalid". The constraint
 * is therefore expressed here instead, where the locale is visible:
 *
 * - the default locale must carry a value, because every other language falls
 *   back to it and a document without one renders blank in both;
 * - another locale may stay empty, and Payload's `fallback` shows the default
 *   value in its place;
 * - a document may not be created in another locale, so it cannot exist with
 *   an empty default value in the first place.
 */
export const requireDefaultLocaleValue =
	(label: string): Validate =>
	(value, { operation, req }) => {
		const localization = req?.payload?.config?.localization;
		const defaultLocale = localization ? localization.defaultLocale : "en";
		const locale = req?.locale;

		if (locale && locale !== defaultLocale) {
			if (operation === "create") {
				return `Create this document in ${defaultLocale} first: every other language falls back to the ${label} written there.`;
			}

			return true;
		}

		return isBlank(value)
			? `${label} is required in ${defaultLocale}; every other language falls back to it.`
			: true;
	};
