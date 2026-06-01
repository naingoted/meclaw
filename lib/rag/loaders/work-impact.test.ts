import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadWorkImpactDocs } from "./work-impact";

function makePack(baseDir: string, company: string, entries: unknown): void {
  const dir = join(baseDir, `work_impact_${company}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "04_rag_entries.json"), JSON.stringify(entries));
}

describe("loadWorkImpactDocs", () => {
  it("renders one doc per company, sorted by slug", () => {
    const dir = mkdtempSync(join(tmpdir(), "meclaw-work-"));
    makePack(dir, "shopback", [{ category: "growth", summary: "Did growth." }]);
    makePack(dir, "incube8", [{ category: "revenue_billing", summary: "Did revenue." }]);

    const docs = loadWorkImpactDocs(dir);

    expect(docs.map((d) => d.slug)).toEqual(["work/incube8", "work/shopback"]);
    expect(docs[0].title).toBe("Work Impact — Incube8");
  });

  it("renders entry fields as structure-aware markdown sections", () => {
    const dir = mkdtempSync(join(tmpdir(), "meclaw-work-"));
    makePack(dir, "incube8", [
      {
        id: "revenue_billing_monetisation",
        category: "revenue_billing_monetisation",
        period: "2025_to_2026",
        size: "big",
        summary: "Worked on revenue-sensitive flows.",
        context_for_non_internal_audience: "Modals affected revenue surfaces.",
        measurable_impact: [
          { "Migrated 3 revenue-generating modals": "Upgrade CTA, Purchase Boost, Activate Boost." },
          "Preserved conversion analytics.",
        ],
        related_initiatives: ["Boost", "Upgrade CTA"],
        confidence: "high",
      },
    ]);

    const [doc] = loadWorkImpactDocs(dir);

    expect(doc.body).toContain("# Work Impact — Incube8");
    expect(doc.body).toContain("## Revenue Billing Monetisation (2025_to_2026, big)");
    expect(doc.body).toContain("Worked on revenue-sensitive flows.");
    expect(doc.body).toContain("Context: Modals affected revenue surfaces.");
    expect(doc.body).toContain(
      "- Migrated 3 revenue-generating modals: Upgrade CTA, Purchase Boost, Activate Boost.",
    );
    expect(doc.body).toContain("- Preserved conversion analytics.");
    expect(doc.body).toContain("Related initiatives: Boost, Upgrade CTA.");
    expect(doc.body).toContain("Confidence: high.");
  });

  it("tolerates numeric periods and missing optional fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "meclaw-work-"));
    makePack(dir, "incube8", [{ category: "auth", period: 2024, summary: "Auth work." }]);

    const [doc] = loadWorkImpactDocs(dir);

    expect(doc.body).toContain("## Auth (2024)");
    expect(doc.body).toContain("Auth work.");
    expect(doc.body).not.toContain("Context:");
    expect(doc.body).not.toContain("Confidence:");
  });

  it("returns empty when the base dir is missing", () => {
    expect(loadWorkImpactDocs(join(tmpdir(), "does-not-exist-meclaw"))).toEqual([]);
  });

  it("skips packs with no entries file, malformed JSON, or empty arrays", () => {
    const dir = mkdtempSync(join(tmpdir(), "meclaw-work-"));
    mkdirSync(join(dir, "work_impact_empty"), { recursive: true });
    mkdirSync(join(dir, "work_impact_blank"), { recursive: true });
    writeFileSync(join(dir, "work_impact_blank", "04_rag_entries.json"), "[]");
    mkdirSync(join(dir, "work_impact_bad"), { recursive: true });
    writeFileSync(join(dir, "work_impact_bad", "04_rag_entries.json"), "not json");
    makePack(dir, "incube8", [{ category: "auth", summary: "Auth." }]);

    const docs = loadWorkImpactDocs(dir);

    expect(docs.map((d) => d.slug)).toEqual(["work/incube8"]);
  });

  it("ignores non-pack directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "meclaw-work-"));
    mkdirSync(join(dir, "other_dir"), { recursive: true });
    makePack(dir, "incube8", [{ category: "auth", summary: "Auth." }]);

    expect(loadWorkImpactDocs(dir).map((d) => d.slug)).toEqual(["work/incube8"]);
  });
});
