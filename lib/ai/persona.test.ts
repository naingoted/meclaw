import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./persona";
import type { KnowledgeDoc } from "@/lib/content";

const docs: KnowledgeDoc[] = [
  { slug: "persona.md", title: "Persona", body: "Warm and direct." },
  { slug: "resume.md", title: "Resume", body: "Senior engineer at incube8." },
];

describe("buildSystemPrompt", () => {
  it("embeds every knowledge doc's title and body", () => {
    const prompt = buildSystemPrompt(docs);
    expect(prompt).toContain("Persona");
    expect(prompt).toContain("Warm and direct.");
    expect(prompt).toContain("Resume");
    expect(prompt).toContain("Senior engineer at incube8.");
  });

  it("instructs the model to never break character as an AI", () => {
    const prompt = buildSystemPrompt(docs).toLowerCase();
    expect(prompt).toContain("as an ai");
  });

  it("grounds answers in the knowledge base and forbids inventing facts", () => {
    const prompt = buildSystemPrompt(docs).toLowerCase();
    expect(prompt).toMatch(/don't (know|have)|not sure|honest/);
  });

  it("is deterministic for the same input", () => {
    expect(buildSystemPrompt(docs)).toBe(buildSystemPrompt(docs));
  });

  it("handles empty docs gracefully", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("(No knowledge files found.");
    expect(prompt).toContain("You are meclaw");
  });
});
