import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyLead } from "./notify";

describe("notifyLead", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing when LEAD_WEBHOOK_URL is unset", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await notifyLead({ email: "j@a.com", trigger: "provided" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs a Slack/Discord-compatible payload when set", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://hooks.example.com/x");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    await notifyLead({ email: "j@a.com", triggerQuestion: "salary?", trigger: "edge_case" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/x");
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.text).toContain("j@a.com");
    expect(payload.text).toContain("salary?");
  });

  it("never throws when the webhook fetch fails", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://hooks.example.com/x");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(notifyLead({ phone: "+65 1", trigger: "provided" })).resolves.toBeUndefined();
  });

  it("POSTs to the Telegram sendMessage API when token + chat id are set", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100555");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    await notifyLead({ email: "j@a.com", triggerQuestion: "pricing?", trigger: "edge_case" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.chat_id).toBe("-100555");
    expect(payload.text).toContain("j@a.com");
    expect(payload.text).toContain("pricing?");
  });

  it("sends to both channels when both are configured", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://hooks.example.com/x");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100555");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    await notifyLead({ phone: "+65 9111 1111", trigger: "provided" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("never throws when Telegram fails and never logs the token", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100555");
    // Use an error that contains the token URL to verify it's not logged
    const tokenUrl = "https://api.telegram.org/bot123:abc/sendMessage";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error(`fetch failed: ${tokenUrl} connection refused`),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyLead({ email: "j@a.com", trigger: "provided" })).resolves.toBeUndefined();
    const logged = errSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain("123:abc");
    expect(logged).toContain("telegram failed:");
  });

  it("skips Telegram when only one of token/chat id is set", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await notifyLead({ email: "j@a.com", trigger: "provided" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
