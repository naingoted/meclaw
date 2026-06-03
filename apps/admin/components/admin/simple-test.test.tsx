import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/admin/config",
  useSearchParams: () => nav.search,
}));

import { useUrlState } from "@/lib/use-url-state";

function TestComponent() {
  const [tab, setTab] = useUrlState("tab", "a", ["a", "b"]);
  return (
    <div>
      <div>Current: {tab}</div>
      <button onClick={() => setTab("b")}>Click me</button>
    </div>
  );
}

describe("useUrlState simple", () => {
  it("calls router.replace", () => {
    nav.replace.mockClear();
    nav.search = new URLSearchParams();
    render(<TestComponent />);
    
    expect(screen.getByText("Current: a")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Click me"));
    
    console.log("nav.replace was called:", nav.replace.mock.calls.length, "times");
    console.log("with:", nav.replace.mock.calls);
    expect(nav.replace).toHaveBeenCalled();
  });
});
