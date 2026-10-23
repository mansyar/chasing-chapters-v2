import type { Validate } from "payload";

const isBlank = (value: unknown): boolean =>
	value === undefined ||
	value === null ||
	(typeof value === "string" && value.trim().length === 0);

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
