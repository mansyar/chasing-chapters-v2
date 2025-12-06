import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";

export const Tags: CollectionConfig = {
  slug: "tags",
  admin: {
    useAsTitle: "name",
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => user?.role === "admin",
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
      name: "description",
      type: "textarea",
    },
    {
      name: "slug",
      type: "text",
      admin: {
        position: "sidebar",
      },
      hooks: {
        beforeValidate: [formatSlug("name")],
      },
    },
  ],
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const { payload } = req;
        const reviews = await payload.find({
          collection: "reviews",
          where: { tags: { contains: id } },
          limit: 1,
        });
        if (reviews.docs.length > 0) {
          throw new Error(
            "Cannot delete tag that is used by existing reviews."
          );
        }
      },
    ],
  },
};
