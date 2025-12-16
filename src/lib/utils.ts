/* eslint-disable @typescript-eslint/no-explicit-any */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import crypto from "crypto";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Hash an email address using SHA-256 for privacy-preserving storage.
 * Used to identify returning commenters without storing plain-text emails.
 */
export function hashEmail(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

export function extractTextFromRichText(content: any): string {
  if (!content?.root?.children) return "";

  const extractText = (node: any): string => {
    if (node.text) return node.text;
    if (node.children) {
      return node.children.map(extractText).join("");
    }
    return "";
  };

  return content.root.children.map(extractText).join(" ");
}
