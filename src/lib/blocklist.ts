/**
 * Spam content detection utility
 * Used to flag potentially spammy comments for moderation
 */

// Common spam keywords and patterns
const BLOCKED_KEYWORDS = [
  // Pharmaceutical spam
  "viagra",
  "cialis",
  "pharmacy",
  "prescription",
  "pills",
  "medication",
  "drug",

  // Gambling/Casino
  "casino",
  "poker",
  "betting",
  "gambling",
  "slots",
  "jackpot",
  "lottery",

  // Crypto/Finance scams
  "crypto",
  "bitcoin",
  "ethereum",
  "nft",
  "blockchain",
  "forex",
  "investment opportunity",
  "make money fast",
  "free money",
  "double your",
  "passive income",
  "get rich",

  // Adult content
  "xxx",
  "porn",
  "adult content",
  "18+",
  "nsfw",

  // Common spam phrases
  "click here",
  "act now",
  "limited time",
  "order now",
  "buy now",
  "free trial",
  "no obligation",
  "winner",
  "congratulations",
  "you have been selected",
  "work from home",
  "earn extra",

  // SEO spam
  "backlink",
  "seo service",
  "rank higher",
  "google ranking",

  // Malware/Phishing
  "download now",
  "install now",
  "update required",
  "verify your account",
  "confirm your identity",
];

// Regex patterns for more complex matching
const BLOCKED_PATTERNS: RegExp[] = [
  // URLs (optional - can be adjusted)
  /https?:\/\/[^\s]+/i,

  // Email addresses (often used in spam)
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,

  // Phone numbers
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,

  // All caps words (shouting) - more than 3 consecutive caps words
  /\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b/,

  // Repeated characters (e.g., "freeeeee", "bestttt")
  /(.)\1{4,}/,

  // Crypto wallet addresses
  /\b0x[a-fA-F0-9]{40}\b/,
  /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/,
];

/**
 * Check if content contains spam indicators
 * @param content - The comment content to check
 * @returns true if content appears to be spam
 */
export function isSpamContent(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // Check for blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the reason why content was flagged as spam
 * Useful for admin review
 * @param content - The comment content to check
 * @returns Array of reasons, empty if not spam
 */
export function getSpamReasons(content: string): string[] {
  const reasons: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      reasons.push(`Contains blocked keyword: "${keyword}"`);
    }
  }

  if (/https?:\/\/[^\s]+/i.test(content)) {
    reasons.push("Contains URL");
  }

  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content)) {
    reasons.push("Contains email address");
  }

  if (/(.)\1{4,}/.test(content)) {
    reasons.push("Contains repeated characters");
  }

  return reasons;
}
