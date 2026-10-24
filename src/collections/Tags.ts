import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";
import { requireDefaultLocaleValue } from "./requireDefaultLocaleValue";

export const Tags: CollectionConfig = {
	slug: "tags",
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
			// Required in the default locale by the validator, not by
			// `required`, which Payload applies to every locale (FR-10).
			localized: true,
			validate: requireDefaultLocaleValue("Name"),
		},
		{
			name: "description",
			type: "textarea",
			localized: true,
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
					where: { tags: { contains: id } },
					limit: 1,
				});
				if (reviews.docs.length > 0) {
					throw new Error(
						"Cannot delete tag that is used by existing reviews.",
					);
				}
			},
		],
	},
};
