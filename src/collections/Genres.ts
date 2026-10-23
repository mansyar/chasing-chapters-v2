import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";
import { requireDefaultLocaleValue } from "./requireDefaultLocaleValue";

export const Genres: CollectionConfig = {
	slug: "genres",
	admin: {
		useAsTitle: "name",
	},
	access: {
		read: () => true,
		create: ({ req: { user } }) => user?.role === "admin",
		update: ({ req: { user } }) => user?.role === "admin",
		delete: ({ req: { user } }) => user?.role === "admin",
	},
	fields: [
		{
			name: "name",
			type: "text",
			// The English name is the default-locale value; an empty
			// Indonesian name falls back to it (FR-10). Payload would treat
			// `required` as required in every locale, which a hand-authored
			// translation could never satisfy, so the rule lives in the
			// validator instead.
			localized: true,
			validate: requireDefaultLocaleValue("Name"),
		},
		{
			name: "slug",
			type: "text",
			admin: {
				position: "sidebar",
			},
			hooks: {
				beforeValidate: [formatSlug("name")],
			},
		},
	],
	hooks: {
		beforeDelete: [
			async ({ id, req }) => {
				const { payload } = req;
				const reviews = await payload.find({
					collection: "reviews",
					where: { genres: { contains: id } },
					limit: 1,
				});
				if (reviews.docs.length > 0) {
					throw new Error(
						"Cannot delete genre that is used by existing reviews.",
					);
				}
			},
		],
	},
};
