import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/admin/config",
  useSearchParams: () => nav.search,
}));

import { useUrlState } from "./use-url-state";

const ALLOWED = ["agents", "rag", "public"] as const;

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = new URLSearchParams();
});

describe("useUrlState", () => {
  it("returns the fallback when the param is absent", () => {
    const { result } = renderHook(() => useUrlState("tab", "agents", ALLOWED));
    expect(result.current[0]).toBe("agents");
  });

  it("reads a valid param from the URL", () => {
    nav.search = new URLSearchParams("tab=rag");
    const { result } = renderHook(() => useUrlState("tab", "agents", ALLOWED));
    expect(result.current[0]).toBe("rag");
  });

  it("returns the fallback when the param value is not allowed", () => {
    nav.search = new URLSearchParams("tab=lol");
    const { result } = renderHook(() => useUrlState("tab", "agents", ALLOWED));
    expect(result.current[0]).toBe("agents");
  });

  it("replaces the URL with the new param on setValue, preserving other params", () => {
    nav.search = new URLSearchParams("keep=1");
    const { result } = renderHook(() => useUrlState("tab", "agents", ALLOWED));
    act(() => result.current[1]("public"));
    expect(nav.replace).toHaveBeenCalledWith(
      "/admin/config?keep=1&tab=public",
      { scroll: false },
    );
  });
});
