import { TooltipProvider } from "@meclaw/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldLabel } from "./field-label";

describe("FieldLabel", () => {
  it("renders the label and an info affordance with an accessible name", () => {
    render(
      <TooltipProvider>
        <FieldLabel label="Top-K" help="How many chunks retrieval pulls." />
      </TooltipProvider>,
    );
    expect(screen.getByText("Top-K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Top-K help/i })).toBeInTheDocument();
  });
});
