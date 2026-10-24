import type { FieldHook } from "payload";

const format = (val: string): string =>
	val
		.replace(/ /g, "-")
		.replace(/[^\w-]+/g, "")
		.toLowerCase();

/**
 * Whether the write targets a locale other than the default one.
 *
 * Payload runs a field hook for every field it is given, so a write that only
 * carries the Indonesian values still reaches the slug hook - without a slug of
 * its own. A localized slug is out of scope: `/id/...` and `/en/...` address the
 * same document, so the slug has to stay whatever the default-locale value
 * derived. Deriving it from the translated name or title would re-point a
 * published URL the moment an author fills in the Indonesian value.
 */
const writesNonDefaultLocale = (
	req: Parameters<FieldHook>[0]["req"],
): boolean => {
	const localization = req?.payload?.config?.localization;

	if (!localization) {
		return false;
	}

	return Boolean(req.locale) && req.locale !== localization.defaultLocale;
};

const formatSlug =
	(fallback: string): FieldHook =>
	({ value, originalDoc, data, req }) => {
		if (writesNonDefaultLocale(req)) {
			// A document that already has a slug keeps it: a translation must not
			// move a published URL. A value the write does carry is formatted like
			// any other slug, so a localized write cannot store a raw one.
			const slug =
				typeof value === "string" && value.length > 0
					? format(value)
					: undefined;

			return originalDoc?.slug ?? slug ?? value;
		}

		if (typeof value === "string" && value.length > 0) {
			return format(value);
		}
		const fallbackData = data?.[fallback] || originalDoc?.[fallback];

		if (fallbackData && typeof fallbackData === "string") {
			return format(fallbackData);
		}

		return value;
	};

export default formatSlug;
