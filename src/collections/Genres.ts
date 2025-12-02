import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";

export const Genres: CollectionConfig = {
  slug: "genres",
  admin: {
    useAsTitle: "name",
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
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
};
