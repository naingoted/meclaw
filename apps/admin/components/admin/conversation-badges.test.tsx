import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OutcomeBadge, TurnCountBadge } from "./conversation-badges";

describe("OutcomeBadge", () => {
  it("renders the outcome label", () => {
    render(<OutcomeBadge outcome="gap" />);
    expect(screen.getByText("gap")).toBeInTheDocument();
  });

  it("applies the danger tone class for gap", () => {
    const { container } = render(<OutcomeBadge outcome="gap" />);
    expect(container.firstChild).toHaveClass("text-destructive");
  });

  it("applies the success tone class for answered", () => {
    const { container } = render(<OutcomeBadge outcome="answered" />);
    expect(container.firstChild).toHaveClass("text-success");
  });
});

describe("TurnCountBadge", () => {
  it("renders 'N turns'", () => {
    render(<TurnCountBadge count={3} />);
    expect(screen.getByText("3 turns")).toBeInTheDocument();
  });

  it("flags long conversations (>8) with the accent class", () => {
    const { container } = render(<TurnCountBadge count={9} />);
    expect(container.firstChild).toHaveClass("text-accent");
  });
});
