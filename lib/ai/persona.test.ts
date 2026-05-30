import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./persona";
import type { KnowledgeDoc } from "@/lib/content";
import type { RagSearchResult } from "@/lib/rag/types";

const docs: KnowledgeDoc[] = [
  { slug: "persona.md", title: "Persona", body: "Warm and direct." },
  { slug: "resume.md", title: "Resume", body: "Senior engineer at incube8." },
];

const retrievedChunks: RagSearchResult[] = [
  {
    id: "resume.md:0",
    source: "resume.md",
    title: "Resume",
    text: "Senior engineer at incube8.",
    ordinal: 0,
    score: 0.92,
  },
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

  it("uses only retrieved chunks in the knowledge section when retrieval succeeds", () => {
    const prompt = buildSystemPrompt(docs, {
      mode: "rag",
      retrievedChunks,
      fullCorpusFallbackMaxChars: 0,
    });

    expect(prompt).toContain("## Resume");
    expect(prompt).toContain("Source: resume.md");
    expect(prompt).toContain("Senior engineer at incube8.");
    expect(prompt).not.toContain("## Persona");
    expect(prompt).not.toContain("Warm and direct.");
  });

  it("falls back to the full corpus when retrieved chunks are empty", () => {
    const prompt = buildSystemPrompt(docs, {
      mode: "rag",
      retrievedChunks: [],
    });

    expect(prompt).toContain("## Persona");
    expect(prompt).toContain("## Resume");
  });

  it("falls back to the full corpus when retrieval mode is fallback", () => {
    const prompt = buildSystemPrompt(docs, {
      mode: "fallback",
      retrievedChunks,
    });

    expect(prompt).toContain("## Persona");
    expect(prompt).toContain("## Resume");
  });

  it("keeps the full corpus when the corpus is small enough to fit", () => {
    const prompt = buildSystemPrompt(docs, {
      mode: "rag",
      retrievedChunks,
      fullCorpusFallbackMaxChars: 10_000,
    });

    expect(prompt).toContain("## Persona");
    expect(prompt).toContain("Warm and direct.");
    expect(prompt).toContain("## Resume");
    expect(prompt).toContain("Senior engineer at incube8.");
  });
});
