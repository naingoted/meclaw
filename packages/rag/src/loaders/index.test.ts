import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadIngestDocs } from "./index";

describe("loadIngestDocs", () => {
  it("loads markdown and PDF docs together, sorted by slug", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meclaw-ingest-"));
    writeFileSync(join(dir, "persona.md"), "# Persona\n\nThet is an engineer.");
    mkdirSync(join(dir, "knowledge"), { recursive: true });
    writeFileSync(join(dir, "knowledge", "career.md"), "# Career\n\nWorked places.");
    // reuse the committed PDF fixture as a stand-in résumé
    copyFileSync(
      join(__dirname, "__fixtures__", "sample.pdf"),
      join(dir, "resume.pdf"),
    );

    const docs = await loadIngestDocs(dir);
    const slugs = docs.map((d) => d.slug);

    expect(slugs).toEqual(["knowledge/career.md", "persona.md", "resume.pdf"]);
    const pdfDoc = docs.find((d) => d.slug === "resume.pdf");
    expect(pdfDoc?.body).toContain("Thet Naing Resume Fixture");
  });

  it("merges work-impact packs from the sibling data/ dir", async () => {
    const root = mkdtempSync(join(tmpdir(), "meclaw-root-"));
    const contentDir = join(root, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, "persona.md"), "# Persona\n\nThet is an engineer.");

    const packDir = join(root, "data", "work_impact_incube8");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "04_rag_entries.json"),
      JSON.stringify([{ category: "revenue_billing", summary: "Did revenue work." }]),
    );

    const docs = await loadIngestDocs(contentDir);

    expect(docs.map((d) => d.slug)).toEqual(["persona.md", "work/incube8"]);
    const work = docs.find((d) => d.slug === "work/incube8");
    expect(work?.body).toContain("Did revenue work.");
  });
});
