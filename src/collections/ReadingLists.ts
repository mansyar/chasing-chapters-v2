import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";

export const ReadingLists: CollectionConfig = {
  slug: "reading-lists",
  admin: {
    useAsTitle: "title",
  },
  versions: {
    drafts: true,
  },
  access: {
    read: () => true,
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
      required: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "authors",
      required: true,
      admin: {
        position: "sidebar",
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
};
