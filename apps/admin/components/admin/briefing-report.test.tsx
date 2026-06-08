import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BriefingReport } from "@/lib/research/types";
import { BriefingReportView } from "./briefing-report";

const REPORT: BriefingReport = {
  summary: "Strong backend fit.",
  fit_score: 0.82,
  matched_strengths: [
    {
      point: "Owns the AI sidecar",
      evidence: "Built the LangGraph pipeline.",
      sources: [{ kind: "corpus", ref: "about.md", title: "About" }],
    },
  ],
  gaps: [{ point: "No k8s", note: "not shown in corpus" }],
  talking_points: ["Ask about scaling"],
  sources: [{ kind: "web", ref: "https://acme.com", title: "Acme" }],
};

describe("BriefingReportView", () => {
  it("renders the dossier sections", () => {
    render(
      <BriefingReportView
        report={REPORT}
        status="done"
        target={{ company: "Acme", role: "Backend" }}
      />,
    );
    expect(screen.getByText("Strong backend fit.")).toBeTruthy();
    expect(screen.getByText("Acme · Backend")).toBeTruthy();
    expect(screen.getByText("Matched strengths")).toBeTruthy();
    expect(screen.getByText("Gaps")).toBeTruthy();
    expect(screen.getByText("Talking points")).toBeTruthy();
    expect(screen.getByText("Sources")).toBeTruthy();
    expect(screen.getByText("Owns the AI sidecar")).toBeTruthy();
    expect(screen.getByText("0.82")).toBeTruthy();
    expect(screen.getByText("Ask about scaling")).toBeTruthy();
    expect(screen.getByText("done").className).toContain("bg-success/15");
  });

  it("renders degraded runs with a warning status pill", () => {
    render(<BriefingReportView report={REPORT} status="degraded" target={{ company: "Acme" }} />);
    expect(screen.getByText("degraded").className).toContain("bg-accent/15");
  });
});
