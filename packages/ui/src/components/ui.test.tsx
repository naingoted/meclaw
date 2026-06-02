import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./button";
import { Badge } from "./badge";
import { Spinner } from "./spinner";
import { Skeleton } from "./skeleton";
import { StatusPill } from "./status-pill";
import { StatTile } from "./stat-tile";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";
import { ThemeProvider, ThemeToggle } from "./theme";

describe("ui primitives", () => {
  it("renders a button and a badge", () => {
    render(<><Button>Go</Button><Badge>ready</Badge></>);
    expect(screen.getByText("Go")).toBeTruthy();
    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("renders a spinner with an accessible label", () => {
    render(<Spinner />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeTruthy();
  });

  it("renders a skeleton block", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.querySelector("[data-slot='skeleton']")).toBeTruthy();
  });

  it("disables and shows a spinner when loading", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button", { name: /save/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status", { name: /loading/i })).toBeTruthy();
  });

  it("supports the ghost-danger variant", () => {
    render(<Button variant="ghost-danger">Delete</Button>);
    expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
  });

  it("renders a status pill with its label", () => {
    render(<StatusPill status="running" />);
    expect(screen.getByText("running")).toBeTruthy();
  });

  it("renders a stat tile", () => {
    render(<StatTile label="Dirty" value={3} />);
    expect(screen.getByText("Dirty")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders a page header with title, subtitle, and action", () => {
    render(<PageHeader title="Documents" subtitle="12 total" action={<button>New</button>} />);
    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy();
    expect(screen.getByText("12 total")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
  });

  it("renders an empty state", () => {
    render(<EmptyState title="No documents yet" />);
    expect(screen.getByText("No documents yet")).toBeTruthy();
  });

  it("renders a theme toggle button inside the provider", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeTruthy();
  });
});
