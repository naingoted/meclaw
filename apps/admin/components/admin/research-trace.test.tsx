import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResearchTrace } from "./research-trace";

describe("ResearchTrace", () => {
  it("announces live progress and shows the initializing state", () => {
    render(<ResearchTrace steps={[]} running status="running" />);
    expect(screen.getByText("initializing…")).toBeTruthy();
    expect(screen.getByRole("list").getAttribute("aria-live")).toBe("polite");
  });

  it("shows outcome markers for degraded and failed runs", () => {
    const { rerender } = render(
      <ResearchTrace
        steps={["Planning research", "Synthesizing report"]}
        running={false}
        status="degraded"
      />,
    );
    expect(screen.getByText("!")).toBeTruthy();

    rerender(
      <ResearchTrace
        steps={["Planning research", "Synthesizing report"]}
        running={false}
        status="error"
      />,
    );
    expect(screen.getByText("×")).toBeTruthy();
  });

  it("renders zero-step terminal fallbacks for degraded and failed runs", () => {
    const { rerender } = render(<ResearchTrace steps={[]} running={false} status="degraded" />);
    expect(screen.getByText("completed with partial results")).toBeTruthy();

    rerender(<ResearchTrace steps={[]} running={false} status="error" />);
    expect(screen.getByText("run failed before progress arrived")).toBeTruthy();
  });
});
