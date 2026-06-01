/**
 * Best-effort owner notification for captured leads. Posts to LEAD_WEBHOOK_URL
 * (Slack/Discord-compatible `{ text }` payload). No-ops when unset; never throws
 * — a notification failure must not break the chat stream.
 */
export type LeadNotice = {
  email?: string;
  phone?: string;
  triggerQuestion?: string;
  trigger: string;
};

export async function notifyLead(lead: LeadNotice): Promise<void> {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return;

  const text =
    `New lead — email: ${lead.email ?? "—"}, ` +
    `phone: ${lead.phone ?? "—"}, ` +
    `q: ${lead.triggerQuestion ?? "—"} ` +
    `(${lead.trigger})`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch (e) {
    console.error("[notify] lead webhook failed:", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
