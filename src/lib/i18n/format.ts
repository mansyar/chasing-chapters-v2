/**
 * Interface-string interpolation.
 *
 * It lives apart from `dictionary.ts` on purpose: client components need to
 * fill `{placeholder}` holes in strings the server handed them, but they must
 * never import the dictionaries themselves (`NFR-2`). This module carries no
 * copy, only the one pure function, so importing it costs nothing.
 */

/**
 * Fills `{placeholder}` holes in a dictionary string.
 *
 * An unknown placeholder is left as written — visible in a test rather than
 * swallowed — and a missing value renders an empty string instead of
 * `undefined`.
 */
export function formatMessage(
	template: string,
	values: Record<string, string | number> = {},
): string {
	return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
		name in values ? String(values[name]) : placeholder,
	);
}
