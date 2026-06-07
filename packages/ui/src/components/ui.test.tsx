import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";
import { StatTile } from "./stat-tile";
import { StatusPill } from "./status-pill";
import { ThemeProvider, ThemeToggle } from "./theme";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("ui primitives", () => {
  it("renders a button and a badge", () => {
    render(
      <>
        <Button>Go</Button>
        <Badge>ready</Badge>
      </>,
    );
    expect(screen.getByText("Go")).toBeTruthy();
    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("button signals clickability with a pointer cursor", () => {
    render(<Button>Go2</Button>);
    expect(screen.getByRole("button", { name: "Go2" }).className).toContain("cursor-pointer");
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

  it("renders its trigger; content is mounted lazily by Radix", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>info</TooltipTrigger>
          <TooltipContent>helpful text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText("info")).toBeTruthy();
  });
});
