import type { CollectionAfterLoginHook, CollectionConfig } from "payload";

/**
 * Hook to set default locale preference to English on first login
 */
const setDefaultLocalePreference: CollectionAfterLoginHook = async ({
	req,
	user,
}) => {
	try {
		// Check if locale preference exists
		const existingPref = await req.payload.find({
			collection: "payload-preferences",
			where: {
				and: [
					{ key: { equals: "locale" } },
					{ "user.value": { equals: user.id } },
					{ "user.relationTo": { equals: "authors" } },
				],
			},
			limit: 1,
		});

		// If no preference, create one with English as default
		if (existingPref.docs.length === 0) {
			await req.payload.create({
				collection: "payload-preferences",
				data: {
					key: "locale",
					value: "en",
					// The preferences collection marks `user` as required. The
					// write names the authenticated author explicitly, so the
					// preference is stored for that author and not for
					// whoever the collection's own hook would default to.
					user: {
						relationTo: "authors",
						value: user.id,
					},
				},
				// A Local API call runs without a request, so `req.user` would
				// be empty and the hook would blank the field. The
				// authenticated user has to travel with the write.
				user,
				// The write joins the login transaction. In its own
				// transaction the preference's relationship row waits for
				// the lock the login holds on the author row, while the
				// login waits for the write - neither side ever finishes.
				req,
			});
		}
	} catch (error) {
		// Log but don't block login
		console.error("Failed to set default locale preference:", error);
	}

	return user;
};

export const Authors: CollectionConfig = {
	slug: "authors",
	admin: {
		useAsTitle: "name",
	},
	auth: true,
	access: {
		read: () => true,
		create: ({ req: { user } }) => {
			return user?.role === "admin";
		},
		update: ({ req: { user }, id }) => {
			if (user?.role === "admin") return true;
			return user?.id === id;
		},
		delete: ({ req: { user } }) => {
			return user?.role === "admin";
		},
	},
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "avatar",
			type: "upload",
			relationTo: "media",
		},
		{
			name: "bio",
			type: "textarea",
		},
		{
			name: "role",
			type: "select",
			options: [
				{ label: "Admin", value: "admin" },
				{ label: "Writer", value: "writer" },
			],
			defaultValue: "writer",
			required: true,
			access: {
				// A writer may update their own document so they can edit their
				// name, avatar and bio, which the collection rule above allows.
				// Only an admin may move an account between roles; for everyone
				// else Payload drops `role` from the write rather than rejecting
				// the whole update, so profile editing still succeeds.
				update: ({ req: { user } }) => user?.role === "admin",
			},
		},
	],
	hooks: {
		afterLogin: [setDefaultLocalePreference],
		beforeDelete: [
			async ({ id, req }) => {
				const { payload } = req;
				const reviews = await payload.find({
					collection: "reviews",
					where: { author: { equals: id } },
					limit: 1,
				});
				if (reviews.docs.length > 0) {
					throw new Error(
						"Cannot delete author with existing reviews. Please reassign or delete the reviews first.",
					);
				}
			},
		],
	},
};
