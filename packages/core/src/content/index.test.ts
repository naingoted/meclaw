import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { contentDir, loadKnowledge } from "./index";

const originalEnv = process.env.MECLAW_CONTENT_DIR;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.MECLAW_CONTENT_DIR;
  else process.env.MECLAW_CONTENT_DIR = originalEnv;
});

describe("contentDir", () => {
  it("defaults to <cwd>/content when MECLAW_CONTENT_DIR is unset", () => {
    delete process.env.MECLAW_CONTENT_DIR;
    expect(contentDir()).toBe(join(process.cwd(), "content"));
  });

  it("honors an absolute MECLAW_CONTENT_DIR override (containers where cwd != repo root)", () => {
    process.env.MECLAW_CONTENT_DIR = "/app/content";
    expect(contentDir()).toBe("/app/content");
  });
});

describe("loadKnowledge", () => {
  it("reads the corpus from MECLAW_CONTENT_DIR by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "meclaw-content-"));
    writeFileSync(join(dir, "persona.md"), "# Persona\n\nWarm and direct.");
    process.env.MECLAW_CONTENT_DIR = dir;

    const docs = loadKnowledge();

    expect(docs.map((d) => d.slug)).toEqual(["persona.md"]);
    expect(docs[0].title).toBe("Persona");
  });
});
