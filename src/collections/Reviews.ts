import type { CollectionConfig, Where } from "payload";
import formatSlug from "../hooks/formatSlug";

export const Reviews: CollectionConfig = {
  slug: "reviews",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "bookAuthor", "rating", "status", "publishDate"],
  },
  versions: {
    drafts: true,
  },
  access: {
    read: ({ req: { user } }) => {
      // Admins can see all reviews
      if (user?.role === "admin") return true;
      // Writers can only see their own reviews
      if (user?.role === "writer") {
        return {
          author: {
            equals: user.id,
          },
        } as Where;
      }
      // Public can only see published reviews
      return {
        _status: {
          equals: "published",
        },
      };
    },
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      // Writers can update their own reviews
      return {
        author: {
          equals: user.id,
        },
      } as Where;
    },
    delete: ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      // Writers can delete their own reviews
      return {
        author: {
          equals: user.id,
        },
      } as Where;
    },
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "bookAuthor",
      type: "text",
      required: true,
    },
    {
      name: "rating",
      type: "number",
      min: 1,
      max: 5,
      required: true,
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
      required: true,
    },
    {
      name: "reviewContent",
      type: "richText",
      required: true,
    },
    {
      name: "whatILoved",
      type: "richText",
      label: "What I Loved",
    },
    {
      name: "whatCouldBeBetter",
      type: "richText",
      label: "What Could Be Better",
    },
    {
      name: "perfectFor",
      type: "richText",
      label: "Perfect For",
    },
    {
      name: "favoriteQuotes",
      type: "array",
      fields: [
        {
          name: "quote",
          type: "textarea",
          required: true,
        },
        {
          name: "page",
          type: "text",
        },
      ],
    },
    {
      name: "readingStartDate",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayOnly",
        },
      },
    },
    {
      name: "readingFinishDate",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayOnly",
        },
      },
    },
    {
      name: "featured",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "likes",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: "publishDate",
      type: "date",
      admin: {
        position: "sidebar",
      },
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
      name: "genres",
      type: "relationship",
      relationTo: "genres",
      hasMany: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "tags",
      type: "relationship",
      relationTo: "tags",
      hasMany: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "moodTags",
      type: "relationship",
      relationTo: "mood-tags",
      hasMany: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "relatedReviews",
      type: "relationship",
      relationTo: "reviews",
      hasMany: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "slug",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
      },
      hooks: {
        beforeValidate: [formatSlug("title")],
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === "create" || operation === "update") {
          if (data._status === "published" && !data.publishDate) {
            data.publishDate = new Date();
          }
        }
        return data;
      },
    ],
  },
};
