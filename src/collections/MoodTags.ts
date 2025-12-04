import type { CollectionConfig } from "payload";
import formatSlug from "../hooks/formatSlug";

export const MoodTags: CollectionConfig = {
  slug: "mood-tags",
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
      name: "color",
      type: "text",
      required: true,
      validate: (value: string | null | undefined) => {
        if (value && !/^#[0-9A-F]{6}$/i.test(value)) {
          return "Please enter a valid hex color code (e.g. #FF0000)";
        }
        return true;
      },
    },
    {
      name: "icon",
      type: "text",
      label: "Icon (Emoji or Class)",
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
