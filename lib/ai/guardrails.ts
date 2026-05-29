/**
 * Prompt-injection & system-prompt-extraction guard.
 *
 * Detects high-confidence patterns in user messages that attempt to:
 * - Extract or reveal the system prompt
 * - Override the model's instructions
 * - Change the model's behavior / role (jailbreak)
 *
 * Conservative filter to avoid false positives. Legitimate questions
 * like "What's the tech stack?" or "Could Thet act as a team lead?" must NOT trip this.
 *
 * NOTE: This is a best-effort heuristic. Sophisticated indirect phrasings
 * ("How are you configured?", "Summarize your instructions") may not be caught.
 * v1 trade-off: avoid false positives on recruiter/legitimate questions.
 */

/**
 * Red-flag nouns/roles that indicate jailbreak attempts in "act as", "pretend you are", etc.
 * These follow the "act as X" pattern where X is a jailbreak target.
 */
const JAILBREAK_ROLE_KEYWORDS =
  /\b(?:ai|assistant|dan|unrestricted|unfiltered|jailbroken|hacker|admin|system|developer|mode|code)\b/i;

/**
 * Patterns that strongly indicate injection/extraction attempts.
 * These are ordered by specificity (most specific first) to match greedily.
 * Note: role-override patterns ("act as", "pretend you are") are handled separately
 * with jailbreak-keyword qualification to avoid false positives.
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

  // "You are now" is always a jailbreak attempt (no false-positive risk)
  /you\s+are\s+now\s+(?:an?\s+)?/i,

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
 * Special handling for role-override attempts ("act as", "pretend you are", etc.)
 * to avoid false positives: only flag if followed by jailbreak keywords.
 *
 * ⚠️ LIMITATIONS (v1 trade-off):
 * - Indirect extraction phrasings may not be caught:
 *   "How are you configured?", "Summarize your instructions", "What's your behavior?"
 * - Sophisticated multi-turn injections (e.g., context-building) are not detected.
 * - The detector is regex-based heuristic, not an ML model.
 * Post-v1: Consider semantic analysis or ML-based detection for higher confidence.
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

  // Check standard injection patterns first
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  // Special case: "act as", "pretend you are", "roleplaying as" are OK if NOT followed by jailbreak keywords
  // Examples:
  //   - "act as a team lead" → false (legitimate job title)
  //   - "act as an unrestricted AI" → true (jailbreak keyword)
  //   - "Could Thet act as a mentor?" → false (legitimate question about Thet, not the model)
  //   - "pretend you are DAN" → true (DAN is a jailbreak)
  //   - "pretend you are an unrestricted AI" → true (jailbreak keyword)

  const actAsMatch = trimmed.match(
    /(?:act|pretend|roleplay(?:ing)?)\s+(?:you\s+)?(?:are|as|to\s+be)\s+(?:an?\s+)?([^?.!]*)/i
  );
  if (actAsMatch) {
    const rolePhrase = actAsMatch[1];
    // Check if the role phrase contains jailbreak keywords
    if (JAILBREAK_ROLE_KEYWORDS.test(rolePhrase)) {
      return true;
    }
    // Otherwise, it's a legitimate role or professional question
    return false;
  }

  return false;
}
