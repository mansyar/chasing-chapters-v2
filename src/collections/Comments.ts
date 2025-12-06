import type { CollectionConfig, Where } from "payload";
import { isSpamContent } from "@/lib/blocklist";

export const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    useAsTitle: "authorName",
    group: "Engagement",
    description: "Comments on book reviews",
    defaultColumns: ["authorName", "status", "relatedReview", "createdAt"],
  },
  access: {
    // Public can only see approved comments
    // Writers can see all comments on their reviews (for moderation)
    read: async ({ req: { user } }) => {
      // Admins can see all comments
      if (user?.role === "admin") return true;

      // Writers can see comments on their own reviews
      if (user?.role === "writer") {
        return {
          "relatedReview.author": {
            equals: user.id,
          },
        } as Where;
      }

      // Public can only see approved comments
      return {
        status: {
          equals: "approved",
        },
      };
    },
    // Anyone can create comments (guest commenting)
    create: () => true,
    // Admins and review authors can update comments (for moderation)
    update: async ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === "admin") return true;

      // Writers can update comments on their own reviews
      if (user.role === "writer") {
        return {
          "relatedReview.author": {
            equals: user.id,
          },
        } as Where;
      }

      return false;
    },
    // Only admins can delete comments
    delete: ({ req: { user } }) => user?.role === "admin",
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === "create" && data) {
          const { payload } = req;

          // Check if commenter exists and get their trust status
          if (data.commenter) {
            try {
              const commenter = await payload.findByID({
                collection: "commenters",
                id: data.commenter,
              });

              // If commenter is banned, reject the comment
              if (commenter?.banned) {
                throw new Error("You are not allowed to comment.");
              }

              // Check content for spam
              const contentIsSpam = isSpamContent(data.content || "");

              // Auto-approve unless content is flagged as spam
              if (contentIsSpam) {
                data.status = "pending"; // Hold for review
              } else {
                data.status = "approved"; // Auto-approve clean content
              }
            } catch {
              // If commenter not found, check spam and auto-approve if clean
              const contentIsSpam = isSpamContent(data.content || "");
              data.status = contentIsSpam ? "pending" : "approved";
            }
          } else {
            // No commenter linked, check spam and auto-approve if clean
            const contentIsSpam = isSpamContent(data.content || "");
            data.status = contentIsSpam ? "pending" : "approved";
          }
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        const { payload } = req;

        // When a comment is approved, update the commenter's approved count
        if (
          operation === "update" &&
          doc.status === "approved" &&
          previousDoc?.status !== "approved" &&
          doc.commenter
        ) {
          try {
            const commenterId =
              typeof doc.commenter === "object"
                ? doc.commenter.id
                : doc.commenter;

            const commenter = await payload.findByID({
              collection: "commenters",
              id: commenterId,
            });

            if (commenter) {
              const newCount = (commenter.approvedCommentCount || 0) + 1;
              const shouldTrust = newCount >= 3;

              await payload.update({
                collection: "commenters",
                id: commenterId,
                data: {
                  approvedCommentCount: newCount,
                  trusted: shouldTrust || commenter.trusted,
                },
              });
            }
          } catch (error) {
            console.error("Error updating commenter count:", error);
          }
        }
      },
    ],
  },
  fields: [
    {
      name: "authorName",
      type: "text",
      required: true,
      admin: {
        description: "Display name of the commenter",
      },
    },
    {
      name: "content",
      type: "textarea",
      required: true,
      maxLength: 2000,
      admin: {
        description: "Comment content (max 2000 characters)",
      },
    },
    {
      name: "relatedReview",
      type: "relationship",
      relationTo: "reviews",
      required: true,
      index: true,
    },
    {
      name: "commenter",
      type: "relationship",
      relationTo: "commenters",
      required: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
        { label: "Reported", value: "reported" },
      ],
      defaultValue: "pending",
      required: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "reportCount",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Number of times this comment has been reported",
      },
    },
    {
      name: "reportedBy",
      type: "array",
      admin: {
        readOnly: true,
        condition: (data) => (data?.reportCount || 0) > 0,
      },
      fields: [
        {
          name: "email",
          type: "email",
        },
        {
          name: "reportedAt",
          type: "date",
        },
      ],
    },
  ],
};
