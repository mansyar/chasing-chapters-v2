import type { CollectionConfig } from "payload";

export const Commenters: CollectionConfig = {
	slug: "commenters",
	admin: {
		useAsTitle: "name",
		group: "Engagement",
		description: "Guest commenters who leave comments on reviews",
	},
	access: {
		// Only admins can view/manage commenters
		read: ({ req: { user } }) => user?.role === "admin",
		// Guest commenting does not need an open create rule: the
		// `submitComment` server action writes through the Local API, where
		// `overrideAccess` defaults to true and this rule is not consulted.
		// Leaving it open let anyone mint a commenter with `trusted: true`,
		// which skips the spam hold on that commenter's comments.
		create: ({ req: { user } }) => Boolean(user),
		update: ({ req: { user } }) => user?.role === "admin",
		delete: ({ req: { user } }) => user?.role === "admin",
	},
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "emailHash",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				readOnly: true,
				description: "SHA-256 hash of email (privacy-preserving)",
			},
		},
		{
			name: "approvedCommentCount",
			type: "number",
			defaultValue: 0,
			admin: {
				description: "Number of approved comments from this user",
				readOnly: true,
			},
		},
		{
			name: "trusted",
			type: "checkbox",
			defaultValue: false,
			access: {
				// `create` above is open to any authenticated user, so the flag
				// that skips the spam hold is withheld here on create as well as
				// on update. Without the `create` rule a writer could still mint
				// a row with `trusted: true` and comment through it, which is
				// defect 2's mechanism with a session instead of anonymity.
				//
				// Neither legitimate writer of this field is affected:
				// `Comments.afterChange` and `submitComment` both go through the
				// Local API, where `overrideAccess` defaults to true and field
				// rules are not consulted.
				create: ({ req: { user } }) => user?.role === "admin",
				update: ({ req: { user } }) => user?.role === "admin",
			},
			admin: {
				position: "sidebar",
				description: "Trusted users have comments auto-approved",
			},
		},
		{
			name: "banned",
			type: "checkbox",
			defaultValue: false,
			access: {
				// The same two rules as `trusted`: banning a commenter is a
				// moderation decision, and `create` alone would let a writer
				// silence anyone by pre-registering their email hash as banned.
				create: ({ req: { user } }) => user?.role === "admin",
				update: ({ req: { user } }) => user?.role === "admin",
			},
			admin: {
				position: "sidebar",
				description: "Banned users cannot submit comments",
			},
		},
	],
};
