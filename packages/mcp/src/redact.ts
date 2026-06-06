/**
 * Column allowlist of PII fields (matches schema columns in @meclaw/core:
 * leads.email/phone/triggerQuestion, messages.content). Masked in operator
 * tool results unless MCP_ALLOW_PII=true. The public scope never reaches the
 * tools that return these, so this is the operator-scope safety net.
 */
export const PII_COLUMNS = new Set<string>([
  "email",
  "phone",
  "content",
  "triggerQuestion",
]);

const MASK = "[redacted]";

export function redactRows<T extends Record<string, unknown>>(
  rows: T[],
  allowPii: boolean,
): T[] {
  if (allowPii) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const key of Object.keys(out)) {
      if (PII_COLUMNS.has(key) && out[key] != null) out[key] = MASK;
    }
    return out as T;
  });
}
