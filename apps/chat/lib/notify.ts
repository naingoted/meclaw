/**
 * Best-effort owner notification for captured leads. Channels:
 *  - LEAD_WEBHOOK_URL: Slack/Discord-compatible `{ text }` payload.
 *  - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID: Telegram Bot API sendMessage.
 * Each channel no-ops when unset and never throws — a notification failure
 * must not break the chat stream. The Telegram URL embeds the bot token:
 * never log it.
 */
export type LeadNotice = {
  email?: string;
  phone?: string;
  triggerQuestion?: string;
  trigger: string;
};

function leadText(lead: LeadNotice): string {
  return (
    `New lead — email: ${lead.email ?? "—"}, ` +
    `phone: ${lead.phone ?? "—"}, ` +
    `q: ${lead.triggerQuestion ?? "—"} ` +
    `(${lead.trigger})`
  );
}

async function postJson(url: string, body: unknown, channel: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    // Log the channel name only — the Telegram URL contains the bot token.
    // Never log e.message or String(e), which may include the URL.
    const errName = e instanceof Error ? e.name : "Error";
    console.error(`[notify] ${channel} failed: ${errName}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyLead(lead: LeadNotice): Promise<void> {
  const text = leadText(lead);
  const tasks: Promise<void>[] = [];

  const webhookUrl = process.env.LEAD_WEBHOOK_URL;
  if (webhookUrl) tasks.push(postJson(webhookUrl, { text }, "lead webhook"));

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChatId) {
    tasks.push(
      postJson(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        { chat_id: tgChatId, text },
        "telegram",
      ),
    );
  }

  await Promise.all(tasks);
}
