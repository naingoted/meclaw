import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadIngestDocs } from "./index";

describe("loadIngestDocs", () => {
  it("loads markdown and PDF docs together, sorted by slug", async () => {
    const dir = mkdtempSync(join(tmpdir(), "echo-ingest-"));
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
});
