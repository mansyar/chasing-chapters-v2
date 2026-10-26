import type { CollectionConfig, Where } from "payload";
import formatSlug from "../hooks/formatSlug";
import { revalidateReadingListPages } from "../hooks/revalidatePages";
import { requireDefaultLocaleValue } from "./requireDefaultLocaleValue";

export const ReadingLists: CollectionConfig = {
	slug: "reading-lists",
	admin: {
		useAsTitle: "title",
	},
	versions: {
		drafts: true,
	},
	access: {
		read: ({ req: { user } }) => {
			// Admins see every reading list, drafts included. This is the
			// branch the admin panel reads through, so it is what keeps a
			// draft editable.
			if (user?.role === "admin") return true;
			// Writers see their own lists, the shape `Reviews.read` uses.
			// Without this branch a writer's admin list would be empty: their
			// own lists are drafts, and the public branch below hides drafts.
			if (user?.role === "writer") {
				return {
					author: {
						equals: user.id,
					},
				} as Where;
			}
			// Public reads see published lists only. `versions.drafts` is on,
			// so without this constraint `?draft=true` on the REST surface
			// returned unpublished lists to anyone. Reading lists carry no
			// `publishAt` schedule, so the constraint is `_status` alone
			// rather than `publishedAndVisibleWhere` - that fragment names a
			// field this collection does not have. The public pages filter
			// `_status` themselves and read through the Local API, where
			// `overrideAccess` defaults to true, so they never consult this
			// rule.
			return {
				_status: {
					equals: "published",
				},
			} as Where;
		},
		create: ({ req: { user } }) => Boolean(user),
		update: ({ req: { user } }) => {
			if (!user) return false;
			if (user.role === "admin") return true;
			// Authors can update their own reading lists
			return {
				author: {
					equals: user.id,
				},
			};
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			if (user.role === "admin") return true;
			// Authors can delete their own reading lists
			return {
				author: {
					equals: user.id,
				},
			};
		},
	},
	fields: [
		{
			name: "title",
			type: "text",
			// Required in the default locale by the validator, not by
			// `required`, which Payload applies to every locale (FR-10).
			localized: true,
			validate: requireDefaultLocaleValue("Title"),
		},
		{
			name: "description",
			type: "textarea",
			localized: true,
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
			filterOptions: ({ user }) => {
				if (!user) return false;
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
			name: "coverImage",
			type: "upload",
			relationTo: "media",
		},
		{
			name: "reviews",
			type: "relationship",
			relationTo: "reviews",
			hasMany: true,
			filterOptions: () => ({
				_status: { equals: "published" },
			}),
		},
		{
			name: "featured",
			type: "checkbox",
			defaultValue: false,
		},
		{
			name: "slug",
			type: "text",
			admin: {
				position: "sidebar",
			},
			hooks: {
				beforeValidate: [formatSlug("title")],
			},
		},
	],
	hooks: {
		afterChange: [revalidateReadingListPages],
	},
};
