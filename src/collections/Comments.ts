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
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
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
      name: "approved",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
      },
    },
  ],
};
