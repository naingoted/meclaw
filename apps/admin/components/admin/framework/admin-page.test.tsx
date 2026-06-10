import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminPage } from "./admin-page";

describe("AdminPage", () => {
  it("renders title in h1", () => {
    render(<AdminPage title="Test Page">Content</AdminPage>);
    expect(screen.getByRole("heading", { level: 1, name: "Test Page" })).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <AdminPage title="Test" subtitle="10 items">
        Content
      </AdminPage>,
    );
    expect(screen.getByText("10 items")).toBeInTheDocument();
  });

  it("renders children in a <main> element", () => {
    render(<AdminPage title="Test">Page body</AdminPage>);
    expect(screen.getByText("Page body").closest("main")).toBeInTheDocument();
  });

  it("renders header actions when provided", () => {
    render(
      <AdminPage title="Test" action={<button>Export</button>}>
        Content
      </AdminPage>,
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });
});
