import { type ClassValue, clsx } from "clsx";
import crypto from "crypto";
import { twMerge } from "tailwind-merge";

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

/**
 * Minimal structural view of a serialized Lexical rich text document, kept
 * local so this module stays free of server-only imports (Google Cloud
 * Translate, redis). Mirrors the shape used by `src/lib/translate.ts`;
 * everything except the traversed fields stays `unknown` behind the index
 * signature and is narrowed at use sites.
 */
interface RichTextNode {
	[key: string]: unknown;
}

export interface RichTextDocument {
	root?: RichTextNode;
	[key: string]: unknown;
}

export function extractTextFromRichText(
	content: RichTextDocument | null | undefined,
): string {
	const children = content?.root?.children;
	if (!Array.isArray(children)) return "";

	const extractText = (node: RichTextNode): string => {
		if (typeof node.text === "string") return node.text;
		if (Array.isArray(node.children)) {
			return node.children.map(extractText).join("");
		}
		return "";
	};

	return children.map(extractText).join(" ");
}
