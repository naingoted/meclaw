import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./button";
import { Badge } from "./badge";
import { Spinner } from "./spinner";
import { Skeleton } from "./skeleton";

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
});
