import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTable, type Column } from "./admin-table";

type Row = { id: string; name: string; version: number | null };

const columns: Column<Row>[] = [
  { header: "Name", cell: (r) => r.name },
  { header: "Version", cell: (r) => (r.version != null ? `v${r.version}` : "—") },
];

describe("AdminTable", () => {
  it("renders column headers and data rows", () => {
    render(<AdminTable columns={columns} data={[{ id: "1", name: "Alpha", version: 3 }]} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("renders empty state when data is empty", () => {
    render(<AdminTable columns={columns} data={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders loading skeleton when loading", () => {
    const { container } = render(<AdminTable columns={columns} data={[]} loading={true} />);
    // Skeleton renders a div with shimmer class
    expect(container.querySelectorAll(".shimmer").length).toBeGreaterThan(0);
  });

  it("headers have scope='col' for accessibility", () => {
    render(<AdminTable columns={columns} data={[{ id: "1", name: "Alpha", version: 3 }]} />);
    const headers = screen.getAllByRole("columnheader");
    for (const h of headers) {
      expect(h).toHaveAttribute("scope", "col");
    }
  });
});
