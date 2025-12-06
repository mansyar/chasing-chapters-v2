/* eslint-disable @typescript-eslint/no-explicit-any */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
