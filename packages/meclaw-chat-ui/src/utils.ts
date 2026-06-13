const KNOWLEDGE_ROUTES = new Set(["tech", "project", "general"]);

/** Parse ISO `metadata.createdAt` to epoch ms, or undefined when absent/invalid. */
export function parseMessageCreatedAt(metadata: unknown): number | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const createdAt = (metadata as Record<string, unknown>).createdAt;
  if (typeof createdAt !== "string") return undefined;
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function appendStep(steps: string[], label: string): string[] {
  if (steps.length > 0 && steps[steps.length - 1] === label) return steps;
  return [...steps, label];
}

export function hasRenderedText(message: {
  parts?: Array<{ type?: string; text?: string }>;
}): boolean {
  return (
    Array.isArray(message.parts) &&
    message.parts.some((p) => p.type === "text" && (p.text?.length ?? 0) > 0)
  );
}

export function shouldRenderMessage(message: {
  role?: string;
  parts?: Array<{ type?: string; text?: string }>;
}): boolean {
  return !(message.role === "assistant" && !hasRenderedText(message));
}

export function shouldShowThinking(
  status: string,
  messages: Array<{ role?: string; parts?: Array<{ type?: string; text?: string }> }>,
): boolean {
  if (status === "submitted") return true;
  if (status !== "streaming") return false;
  const last = messages[messages.length - 1];
  const hasAssistantText =
    last?.role === "assistant" &&
    Array.isArray(last.parts) &&
    last.parts.some((p) => p.type === "text" && (p.text?.length ?? 0) > 0);
  return !hasAssistantText;
}

export function groundingLabel(route: string | undefined, sourceCount: number): string {
  if (route === "gap") return "saved answer";
  if (route && KNOWLEDGE_ROUTES.has(route)) {
    return sourceCount > 0 ? `grounded on ${sourceCount} sources` : "no matching corpus content";
  }
  return `answered without corpus (intent: ${route ?? "unknown"})`;
}
