import type { CollectionConfig, CollectionAfterLoginHook } from "payload";

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
          user: {
            relationTo: "authors",
            value: user.id,
          },
          value: "en",
        },
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
            "Cannot delete author with existing reviews. Please reassign or delete the reviews first."
          );
        }
      },
    ],
  },
};
