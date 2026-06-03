import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { ConfigRefreshPoller, shouldDeferConfigRefresh } from "./config-refresh-poller";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function mockVersionFetch(version: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ version }), { status: 200 })),
  );
}

describe("shouldDeferConfigRefresh", () => {
  it("defers while the chat is submitted or streaming", () => {
    expect(shouldDeferConfigRefresh("submitted")).toBe(true);
    expect(shouldDeferConfigRefresh("streaming")).toBe(true);
    expect(shouldDeferConfigRefresh("ready")).toBe(false);
    expect(shouldDeferConfigRefresh("error")).toBe(false);
  });
});

describe("ConfigRefreshPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not refresh when the version matches", async () => {
    mockVersionFetch("v1");
    render(<ConfigRefreshPoller initialConfigVersion="v1" status="ready" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the version changes while idle", async () => {
    mockVersionFetch("v2");
    render(<ConfigRefreshPoller initialConfigVersion="v1" status="ready" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("retries polling when refresh does not produce a new version prop", async () => {
    mockVersionFetch("v2");
    render(<ConfigRefreshPoller initialConfigVersion="v1" status="ready" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(refresh).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3001);
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("defers refresh while streaming and refreshes after status becomes ready", async () => {
    mockVersionFetch("v2");
    const { rerender } = render(
      <ConfigRefreshPoller initialConfigVersion="v1" status="streaming" />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      rerender(<ConfigRefreshPoller initialConfigVersion="v1" status="ready" />);
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("ignores failed polling responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "down" }), { status: 503 })),
    );
    render(<ConfigRefreshPoller initialConfigVersion="v1" status="ready" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(refresh).not.toHaveBeenCalled();
  });
});
