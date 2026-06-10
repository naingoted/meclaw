import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminMutation } from "./use-admin-mutation";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAdminMutation", () => {
  it("starts not pending", () => {
    const { result } = renderHook(() => useAdminMutation("/api/admin/test", { method: "POST" }));
    expect(result.current.isPending).toBe(false);
  });

  it("sets isPending during request", async () => {
    let resolveFetch!: (v: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const { result } = renderHook(() => useAdminMutation("/api/admin/test", { method: "POST" }));

    let promise: Promise<unknown>;
    act(() => {
      promise = result.current.mutate();
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await promise;
    });
    expect(result.current.isPending).toBe(false);
  });

  it("dispatches cache invalidation event on success", async () => {
    const listener = vi.fn();
    window.addEventListener("admin-cache-invalidate", listener);

    const { result } = renderHook(() =>
      useAdminMutation("/api/admin/test", {
        method: "POST",
        invalidateKeys: ["documents"],
      }),
    );

    await act(async () => {
      await result.current.mutate();
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const detail = listener.mock.calls[0][0] as CustomEvent;
    expect(detail.detail.keys).toEqual(["documents"]);

    window.removeEventListener("admin-cache-invalidate", listener);
  });
});
