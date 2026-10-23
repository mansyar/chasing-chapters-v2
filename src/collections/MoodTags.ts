import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";
import { requireDefaultLocaleValue } from "./requireDefaultLocaleValue";

export const MoodTags: CollectionConfig = {
	slug: "mood-tags",
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
			// Only the name is language; the color and the icon are not.
			// Required in the default locale by the validator, not by
			// `required`, which Payload applies to every locale (FR-10).
			localized: true,
			validate: requireDefaultLocaleValue("Name"),
		},
		{
			name: "color",
			type: "text",
			required: true,
			validate: (value: string | null | undefined) => {
				if (value && !/^#[0-9A-F]{6}$/i.test(value)) {
					return "Please enter a valid hex color code (e.g. #FF0000)";
				}
				return true;
			},
		},
		{
			name: "icon",
			type: "text",
			label: "Icon (Emoji or Class)",
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
					where: { moodTags: { contains: id } },
					limit: 1,
				});
				if (reviews.docs.length > 0) {
					throw new Error(
						"Cannot delete mood tag that is used by existing reviews.",
					);
				}
			},
		],
	},
};
