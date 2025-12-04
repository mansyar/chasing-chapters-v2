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
    create: () => true, // Created automatically when guests comment
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
      name: "email",
      type: "email",
      required: true,
      unique: true,
      index: true,
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
      admin: {
        position: "sidebar",
        description: "Trusted users have comments auto-approved",
      },
    },
    {
      name: "banned",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Banned users cannot submit comments",
      },
    },
  ],
};
