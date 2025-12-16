import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";
import { revalidateReadingListPages } from "../hooks/revalidatePages";

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
