import type { CollectionConfig } from "payload";

export const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    useAsTitle: "authorName",
  },
  access: {
    read: ({ req: { user } }) => {
      if (user) return true;
      return {
        approved: {
          equals: true,
        },
      };
    },
    create: () => true,
    update: ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      // Authors can update their own comments
      return {
        author: {
          equals: user.id,
        },
      };
    },
    delete: ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      // Authors can delete their own comments
      return {
        author: {
          equals: user.id,
        },
      };
    },
  },
  fields: [
    {
      name: "authorName",
      type: "text",
      required: true,
    },
    {
      name: "content",
      type: "textarea",
      required: true,
    },
    {
      name: "relatedReview",
      type: "relationship",
      relationTo: "reviews",
      required: true,
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "authors",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "approved",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
      },
    },
  ],
};
