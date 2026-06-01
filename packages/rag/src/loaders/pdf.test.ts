import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadPdf } from "./pdf";

const FIXTURE = join(__dirname, "__fixtures__", "sample.pdf");

describe("loadPdf", () => {
  it("extracts a KnowledgeDoc from a PDF file", async () => {
    const doc = await loadPdf(FIXTURE);

    expect(doc.slug).toBe("sample.pdf");
    expect(doc.title).toBe("Sample"); // title derived from filename stem (extraction has no line structure)
    expect(doc.body).toContain("Thet Naing Resume Fixture");
    expect(doc.body).toContain("ShopBack");
  });
});
