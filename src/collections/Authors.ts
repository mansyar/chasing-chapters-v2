import type { CollectionConfig } from "payload";

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
};
