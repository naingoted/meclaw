import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminFetch } from "./use-admin-fetch";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: "test" }), { status: 200 })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAdminFetch", () => {
  it("starts in loading state", () => {
    const { result } = renderHook(() => useAdminFetch<{ data: string }>("/api/test"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("loads data and sets loading to false", async () => {
    const { result } = renderHook(() => useAdminFetch<{ data: string }>("/api/test"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ data: "test" });
  });

  it("refetches on cache invalidation event", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: "v1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useAdminFetch<{ data: string }>("/api/test", { key: ["test-key"] }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate a mutation invalidating "test-key"
    act(() => {
      window.dispatchEvent(
        new CustomEvent("admin-cache-invalidate", { detail: { keys: ["test-key"] } }),
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns error on failed fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not found", { status: 404 })),
    );

    const { result } = renderHook(() => useAdminFetch("/api/test"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
