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
});
