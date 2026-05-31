import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AdminSidebar } from "./admin-sidebar";

describe("AdminSidebar", () => {
  it("renders the three groups and links", () => {
    render(<AdminSidebar />);
    expect(screen.getByText("Knowledge")).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByText("Audit log")).toBeTruthy();
    expect(screen.getByText("Back to chat")).toBeTruthy();
  });
});
