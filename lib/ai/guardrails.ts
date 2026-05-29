/**
 * Prompt-injection & system-prompt-extraction guard.
 *
 * Detects high-confidence patterns in user messages that attempt to:
 * - Extract or reveal the system prompt
 * - Override the model's instructions
 * - Change the model's behavior / role
 *
 * Conservative filter to avoid false positives. Legitimate questions
 * like "What's the tech stack?" must NOT trip this.
 */

/**
 * Patterns that strongly indicate injection/extraction attempts.
 * These are ordered by specificity (most specific first) to match greedily.
 */
const INJECTION_PATTERNS = [
  // System prompt extraction
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /ignore\s+(?:everything|all)\s+(?:above|before)/i,
  /reveal\s+(?:your\s+)?(?:system\s+)?prompt/i,
  /show\s+(?:me\s+)?(?:your\s+)?(?:system\s+)?prompt/i,
  /print\s+(?:your\s+)?(?:system\s+)?prompt/i,
  /repeat\s+(?:your\s+)?(?:system\s+)?prompt/i,
  /what\s+(?:are|is)\s+(?:your\s+)?(?:system\s+)?(?:instructions|rules|prompt)/i,
  /output\s+(?:your\s+)?(?:system\s+)?prompt/i,
  /generate\s+(?:your\s+)?(?:system\s+)?prompt/i,

  // Role-override attempts
  /you\s+are\s+now\s+(?:an?\s+)?/i,
  /pretend\s+(?:you\s+)?are\s+(?:an?\s+)?/i,
  /act\s+as\s+(?:an?\s+)?/i,
  /roleplaying?\s+as\s+(?:an?\s+)?/i,

  // Jailbreak / rule override
  /disregard\s+(?:(?:the\s+)?(?:above|previous)|everything\s+(?:above|previous))/i,
  /forget\s+(?:everything\s+)?(?:above|previous)/i,
  /don't\s+follow|don't\s+obey/i,
  /override\s+(?:your\s+)?(?:system\s+)?rules/i,
  /developer\s+mode/i,
];

/**
 * Detects if a message contains high-confidence injection/extraction patterns.
 *
 * @param text The user message to scan
 * @returns true if injection/extraction detected; false otherwise
 */
export function detectInjection(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  // Check each pattern; if ANY matches, return true
  return INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}
