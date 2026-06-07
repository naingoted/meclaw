import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/documents" }));
vi.mock("@/app/admin/actions", () => ({ signOutAction: vi.fn() }));

import { AdminSidebar } from "./admin-sidebar";

describe("AdminSidebar", () => {
  it("renders groups, links, active state, account, and theme toggle", () => {
    render(<AdminSidebar />);
    expect(screen.getByText("Knowledge")).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByText("Audit log")).toBeTruthy();
    expect(screen.getByText("Back to chat")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeTruthy();
    // active link carries aria-current
    expect(screen.getByRole("link", { name: "Documents" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("sign-out uses a contrast-safe danger hover, not a vanishing one", () => {
    render(<AdminSidebar />);
    const btn = screen.getByRole("button", { name: /sign out/i });
    expect(btn.className).toContain("hover:text-destructive");
    expect(btn.className).not.toContain("hover:text-accent");
  });
});
