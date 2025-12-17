import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import sharp from "sharp";

/**
 * Generate a blur data URL from an image buffer.
 * Creates a tiny 10x10 blurred version encoded as base64.
 */
async function generateBlurDataURL(buffer: Buffer): Promise<string> {
  const blurredBuffer = await sharp(buffer)
    .resize(10, 10, { fit: "cover" })
    .blur(2)
    .toFormat("webp", { quality: 20 })
    .toBuffer();

  return `data:image/webp;base64,${blurredBuffer.toString("base64")}`;
}

/**
 * Hook to generate blur data URL when a new image is uploaded.
 */
const generateBlurPlaceholder: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  // Only process on create or when a new file is uploaded
  if (operation === "create" || req.file) {
    const file = req.file;

    if (file?.data) {
      try {
        const blurDataURL = await generateBlurDataURL(file.data);
        return {
          ...data,
          blurDataURL,
        };
      } catch (error) {
        // Log error but don't block upload
        console.error("Failed to generate blur placeholder:", error);
      }
    }
  }

  return data;
};

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => user?.role === "admin",
  },
  hooks: {
    beforeChange: [generateBlurPlaceholder],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
    },
    {
      name: "blurDataURL",
      type: "text",
      admin: {
        readOnly: true,
        description: "Auto-generated blur placeholder for image loading",
      },
    },
  ],
  upload: {
    staticDir: "media",
    imageSizes: [
      {
        name: "thumbnail",
        width: 400,
        height: 300,
        position: "centre",
      },
      {
        name: "card",
        width: 768,
        height: 1024,
        position: "centre",
      },
      {
        name: "feature",
        width: 1024,
        height: undefined,
        position: "centre",
      },
    ],
    adminThumbnail: "thumbnail",
    mimeTypes: ["image/*"],
  },
};
