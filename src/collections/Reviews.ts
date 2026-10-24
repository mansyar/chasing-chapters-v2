import type { CollectionConfig, Where } from "payload";
import formatSlug from "../hooks/formatSlug";
import { revalidateReviewPages } from "../hooks/revalidatePages";
import {
	recordEnglishChangeTime,
	translateReview,
} from "../hooks/translateReview";
import { normalizeLocale } from "../lib/i18n/locale";
import { publishedAndVisibleWhere } from "../lib/publish-visibility";
import { retranslateReview } from "../lib/retranslate";
import {
	canTransition,
	TRANSLATION_STATUSES,
	type TranslationStatus,
} from "../lib/translation-status";
import { requireDefaultLocaleValue } from "./requireDefaultLocaleValue";

export const Reviews: CollectionConfig = {
	slug: "reviews",
	admin: {
		useAsTitle: "title",
		defaultColumns: [
			"title",
			"bookAuthor",
			"rating",
			"status",
			"translationStatus",
			"publishDate",
			// The schedule is the field an author checks most often while a
			// review is waiting to go out, so it earns a column of its own
			// rather than living behind the edit view (`FR-7`).
			"publishAt",
		],
		/**
		 * Payload's native Preview button (`FR-1`).
		 *
		 * It opens the draft-preview entry point with the document's slug and the
		 * locale being edited, so an author previewing the Indonesian version
		 * lands on the Indonesian page. The URL is root-relative because the admin
		 * panel and the public site share an origin, and Payload uses the returned
		 * string verbatim as the link's `href`.
		 *
		 * The entry route re-checks the session, so this button is a convenience
		 * and never the authority. A document with no slug yet - a new, unsaved
		 * review - has no public URL to preview, so it gets no button rather than
		 * a broken one.
		 */
		preview: (doc, { locale }) => {
			const slug = doc.slug;

			if (typeof slug !== "string" || slug === "") {
				return null;
			}

			const params = new URLSearchParams({
				slug,
				locale: normalizeLocale(locale),
			});

			return `/api/preview?${params.toString()}`;
		},
	},
	versions: {
		drafts: true,
	},
	endpoints: [
		{
			path: "/:id/retranslate",
			method: "post",
			handler: async (req) => {
				const id = Number(req.routeParams?.id);
				const result = await retranslateReview(req.payload, req.user, id);
				return Response.json(result, { status: result.httpStatus });
			},
		},
	],
	access: {
		read: ({ req: { user } }) => {
			// Admins can see all reviews
			if (user?.role === "admin") return true;
			// Writers can only see their own reviews
			if (user?.role === "writer") {
				return {
					author: {
						equals: user.id,
					},
				} as Where;
			}
			// Public reads use the same visibility rule every public page
			// uses (`FR-5`, `NFR-4`): the public REST API is a public surface,
			// so a published review with a future `publishAt` must not be
			// served there either.
			return publishedAndVisibleWhere(new Date());
		},
		create: ({ req: { user } }) => Boolean(user),
		update: ({ req: { user } }) => {
			if (!user) return false;
			if (user.role === "admin") return true;
			// Writers can update their own reviews
			return {
				author: {
					equals: user.id,
				},
			} as Where;
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			if (user.role === "admin") return true;
			// Writers can delete their own reviews
			return {
				author: {
					equals: user.id,
				},
			} as Where;
		},
	},
	fields: [
		{
			name: "title",
			type: "text",
			// A book title may be given in Indonesian by hand. It is
			// deliberately not part of the translation pipeline's content
			// fields: book titles are never machine-translated. Required in
			// the default locale by the validator, not by `required`, which
			// Payload applies to every locale (FR-10).
			localized: true,
			validate: requireDefaultLocaleValue("Title"),
		},
		{
			name: "bookAuthor",
			type: "text",
			required: true,
		},
		{
			name: "rating",
			type: "number",
			min: 1,
			max: 5,
			required: true,
		},
		{
			name: "coverImage",
			type: "upload",
			relationTo: "media",
			// A review is published with its cover: the render sites fall back
			// to an empty frame when the cover is missing, and a published
			// review without a cover is a broken entry.
			required: true,
		},
		{
			name: "reviewContent",
			type: "richText",
			// Required in the default locale only, for the same reason as the
			// title: a document is created with its English body, and the
			// `id` locale may leave the body out and fall back to it. Payload
			// reads `required` on a localized field as "required in every
			// locale", which would reject a locale-scoped clear of an
			// Indonesian body (FR-10).
			localized: true,
			validate: requireDefaultLocaleValue("Review content"),
		},
		{
			name: "whatILoved",
			type: "richText",
			label: "What I Loved",
			localized: true,
		},
		{
			name: "whatCouldBeBetter",
			type: "richText",
			label: "What Could Be Better",
			localized: true,
		},
		{
			name: "perfectFor",
			type: "richText",
			label: "Perfect For",
			localized: true,
		},
		{
			name: "favoriteQuotes",
			type: "array",
			localized: true,
			fields: [
				{
					name: "quote",
					type: "textarea",
					required: true,
				},
				{
					name: "page",
					type: "text",
				},
			],
		},
		{
			name: "readingStartDate",
			type: "date",
			admin: {
				date: {
					pickerAppearance: "dayOnly",
				},
			},
		},
		{
			name: "readingFinishDate",
			type: "date",
			validate: (value, { siblingData }) => {
				const data = siblingData as { readingStartDate?: string };
				if (!value || !data?.readingStartDate) return true;
				const finish = new Date(value);
				const start = new Date(data.readingStartDate);
				if (finish < start) {
					return "Finish date must be on or after start date";
				}
				return true;
			},
			admin: {
				date: {
					pickerAppearance: "dayOnly",
				},
			},
		},
		{
			name: "featured",
			type: "checkbox",
			defaultValue: false,
		},
		{
			name: "autoTranslate",
			type: "checkbox",
			label: "Auto-translate to Indonesian",
			defaultValue: true,
			admin: {
				position: "sidebar",
				description:
					"When enabled, publishing an English update also refreshes the Indonesian translation. Turn off to keep manual control of the Indonesian locale.",
			},
		},
		{
			name: "translationStatus",
			type: "select",
			label: "Translation Status",
			options: [...TRANSLATION_STATUSES],
			defaultValue: "untranslated",
			validate: (
				value: string | string[] | null | undefined,
				options: { previousValue?: unknown },
			) => {
				const previousValue = options.previousValue;
				if (!value || !previousValue || previousValue === value) {
					return true;
				}
				const isKnown = (v: unknown) =>
					TRANSLATION_STATUSES.includes(v as TranslationStatus);
				if (!isKnown(value) || !isKnown(previousValue)) {
					return true;
				}
				return canTransition(
					previousValue as TranslationStatus,
					value as TranslationStatus,
				)
					? true
					: `Invalid translation status transition: ${previousValue} → ${value}`;
			},
			admin: {
				position: "sidebar",
				readOnly: true,
				description: "Managed automatically by the translation pipeline.",
			},
		},
		{
			name: "translationError",
			type: "textarea",
			label: "Translation Error",
			admin: {
				position: "sidebar",
				readOnly: true,
				condition: (data) => data?.translationStatus === "failed",
			},
		},
		{
			name: "retranslateAction",
			type: "ui",
			label: "Re-translate",
			admin: {
				position: "sidebar",
				components: {
					Field:
						"/collections/Reviews/admin/RetranslateButton#RetranslateButton",
				},
			},
		},
		{
			name: "translationUpdatedAt",
			type: "date",
			label: "Translation Updated At",
			admin: {
				position: "sidebar",
				readOnly: true,
				date: {
					pickerAppearance: "dayOnly",
				},
			},
		},
		{
			name: "englishUpdatedAt",
			type: "date",
			label: "English Updated At",
			admin: {
				position: "sidebar",
				readOnly: true,
				date: {
					pickerAppearance: "dayOnly",
				},
				description:
					"When the English content last changed. Compared with the translation timestamp to detect a stale translation.",
			},
		},
		{
			name: "views",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "likes",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "publishDate",
			type: "date",
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "publishAt",
			type: "date",
			label: "Publish At",
			// The schedule the public gate reads (FR-5, FR-6). An empty value
			// means "no schedule", which keeps every existing review visible
			// without a backfill; a value in the future hides the review from
			// every public read until that moment. Storage is UTC: Payload's
			// `date` field stores an instant, and the admin reads it back in
			// the browser's own zone.
			admin: {
				position: "sidebar",
				date: {
					pickerAppearance: "dayAndTime",
				},
				description:
					"Hides the review from every public page until this moment. Leave empty to publish immediately.",
				// The list says which state the row is in rather than echoing
				// the raw date, and the cell is where "scheduled" and "live"
				// become distinguishable at a glance (`FR-7`, `AC-7`).
				components: {
					Cell: "/collections/Reviews/admin/PublishStateCell#PublishStateCell",
				},
			},
		},
		{
			// The sentence that goes with the field above: when this review will
			// publish, or that it already is (`FR-7`, `AC-7`). A `ui` field, so
			// it holds no data - it reads the document through the form state.
			name: "publishScheduleNotice",
			type: "ui",
			admin: {
				position: "sidebar",
				components: {
					Field:
						"/collections/Reviews/admin/PublishScheduleNotice#PublishScheduleNotice",
				},
			},
		},
		{
			name: "author",
			type: "relationship",
			relationTo: "authors",
			required: true,
			admin: {
				position: "sidebar",
			},
			// Admins can select any author, writers can only select themselves
			// For server-side operations (like updates with overrideAccess), allow all
			filterOptions: ({ user }) => {
				if (!user) return true; // Server-side operations without user context
				if (user.role === "admin") return true;
				// Writers can only select themselves
				return {
					id: {
						equals: user.id,
					},
				};
			},
		},
		{
			name: "genres",
			type: "relationship",
			relationTo: "genres",
			hasMany: true,
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "tags",
			type: "relationship",
			relationTo: "tags",
			hasMany: true,
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "moodTags",
			type: "relationship",
			relationTo: "mood-tags",
			hasMany: true,
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "relatedReviews",
			type: "relationship",
			relationTo: "reviews",
			hasMany: true,
			filterOptions: ({ id }) => {
				// Exclude self and only show published reviews
				if (id) {
					return {
						and: [
							{ id: { not_equals: id } },
							{ _status: { equals: "published" } },
						],
					} as Where;
				}
				return { _status: { equals: "published" } };
			},
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "slug",
			type: "text",
			unique: true,
			admin: {
				position: "sidebar",
			},
			hooks: {
				beforeValidate: [formatSlug("title")],
			},
		},
	],
	hooks: {
		beforeChange: [
			({ data, operation, originalDoc }) => {
				if (operation === "create" || operation === "update") {
					// A scheduled review is meant to publish at its schedule, so
					// an empty `publishDate` starts there instead of at the
					// moment the author happened to save (FR-8). An author's own
					// value is never overwritten, and clearing `publishAt`
					// changes nothing here: with no schedule to copy, the date
					// the row already carries stays.
					//
					// A partial update carries only the fields it changes, so the
					// stored date has to be read alongside it: an update that
					// touches `publishAt` alone must not overwrite the author's
					// date with the schedule. Only an absent key falls back to
					// the stored value - an explicit `null` is the author
					// clearing the field, and the fill below has to run for it.
					const publishDate =
						data.publishDate !== undefined
							? data.publishDate
							: originalDoc?.publishDate;
					if (!publishDate) {
						if (data.publishAt) {
							data.publishDate = data.publishAt;
						} else if (data._status === "published") {
							data.publishDate = new Date();
						}
					}
				}
				return data;
			},
			// Writes the English content's change time into the incoming
			// data, so it lands in the same transaction as the save.
			recordEnglishChangeTime,
		],
		afterChange: [translateReview, revalidateReviewPages],
	},
};
