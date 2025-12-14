import { v2 } from "@google-cloud/translate";
import path from "path";
import fs from "fs";

// Initialize client - handles both file-based and inline credentials
const getTranslateClient = () => {
  console.log("[Translation] Initializing Google Cloud client...");

  // Option 1: Inline JSON credentials (for Docker/production)
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    console.log("[Translation] Using inline credentials");

    let credentialsStr = process.env.GOOGLE_CLOUD_CREDENTIALS.trim();

    // Remove surrounding quotes if present (common issue with env vars)
    if (
      (credentialsStr.startsWith("'") && credentialsStr.endsWith("'")) ||
      (credentialsStr.startsWith('"') && credentialsStr.endsWith('"'))
    ) {
      credentialsStr = credentialsStr.slice(1, -1);
    }

    // Handle double-escaped JSON (common with Docker build args)
    // If we see \" it means the JSON is escaped and needs to be unescaped
    if (credentialsStr.includes('\\"')) {
      console.log("[Translation] Detected double-escaped JSON, unescaping...");
      credentialsStr = credentialsStr
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }

    // Log first few characters for debugging (don't log the whole thing for security)
    console.log(
      `[Translation] Credentials start with: ${credentialsStr.substring(0, 20)}...`
    );

    try {
      const credentials = JSON.parse(credentialsStr);
      return new v2.Translate({
        credentials,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
    } catch (parseError) {
      console.error(
        "[Translation] Failed to parse GOOGLE_CLOUD_CREDENTIALS:",
        parseError
      );
      console.error(
        `[Translation] Credentials length: ${credentialsStr.length}, first char: '${credentialsStr[0]}', last char: '${credentialsStr[credentialsStr.length - 1]}'`
      );
      throw new Error(
        "Invalid GOOGLE_CLOUD_CREDENTIALS JSON format. Ensure the JSON is properly escaped in your environment variable."
      );
    }
  }

  // Option 2: Credentials file path
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    let credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    // Resolve relative path to absolute
    if (!path.isAbsolute(credentialsPath)) {
      credentialsPath = path.resolve(process.cwd(), credentialsPath);
    }

    console.log(`[Translation] Using credentials file: ${credentialsPath}`);

    // Check if file exists
    if (!fs.existsSync(credentialsPath)) {
      console.error(
        `[Translation] ERROR: Credentials file not found at ${credentialsPath}`
      );
      throw new Error(`Credentials file not found: ${credentialsPath}`);
    }

    // Read and parse credentials file
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));

    return new v2.Translate({
      credentials,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
    });
  }

  console.warn("[Translation] WARNING: No credentials configured!");
  return new v2.Translate({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  });
};

// Helper to add timeout to a promise
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]);
}

export async function translateText(
  text: string,
  targetLanguage: string = "id"
): Promise<string> {
  if (!text || text.trim() === "") return text;

  console.log(
    `[Translation] Translating ${text.length} chars to ${targetLanguage}...`
  );

  try {
    const client = getTranslateClient();

    // Add 30-second timeout
    const [translation] = await withTimeout(
      client.translate(text, targetLanguage),
      30000,
      "Translation request timed out after 30 seconds"
    );

    console.log(
      `[Translation] Success! Translated to: ${translation.substring(0, 50)}...`
    );
    return translation;
  } catch (error) {
    console.error("[Translation] Failed:", error);
    // Return original text on failure so the publish still succeeds
    return text;
  }
}

// Extract plain text from Lexical editor JSON
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractPlainText(richText: any): string {
  if (!richText?.root?.children) return "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractFromNode = (node: any): string => {
    if (node.text) return node.text;
    if (node.children) {
      return node.children.map(extractFromNode).join("");
    }
    return "";
  };

  return richText.root.children.map(extractFromNode).join("\n").trim();
}

// Create a simple Lexical rich text structure from plain text
export function createRichTextFromPlain(text: string): object {
  return {
    root: {
      type: "root",
      children: text.split("\n").map((paragraph) => ({
        type: "paragraph",
        children: [{ type: "text", text: paragraph, version: 1 }],
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
      })),
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
    },
  };
}
