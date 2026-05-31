import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadKnowledge } from "./content";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "meclaw-content-"));
  writeFileSync(join(dir, "persona.md"), "# Persona\n\nWarm and direct.");
  writeFileSync(join(dir, "resume.md"), "Senior engineer.\n"); // no H1
  mkdirSync(join(dir, "projects"));
  writeFileSync(join(dir, "projects", "meclaw.md"), "# Meclaw\n\nThis bot.");
  writeFileSync(join(dir, "ignore.txt"), "not markdown");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("loadKnowledge", () => {
  it("loads markdown files including nested ones, ignoring non-markdown", () => {
    const docs = loadKnowledge(dir);
    const slugs = docs.map((d) => d.slug);
    expect(slugs).toContain("persona.md");
    expect(slugs).toContain("projects/meclaw.md");
    expect(slugs).not.toContain("ignore.txt");
    expect(docs).toHaveLength(3);
  });

  it("derives the title from the first H1, falling back to the slug", () => {
    const docs = loadKnowledge(dir);
    const persona = docs.find((d) => d.slug === "persona.md");
    const resume = docs.find((d) => d.slug === "resume.md");
    expect(persona?.title).toBe("Persona");
    expect(resume?.title).toBe("resume.md");
  });

  it("returns the full file body and a deterministic order", () => {
    const docs = loadKnowledge(dir);
    expect(docs.map((d) => d.slug)).toEqual([
      "persona.md",
      "projects/meclaw.md",
      "resume.md",
    ]);
    expect(docs[0].body).toBe("# Persona\n\nWarm and direct.");
  });
});
