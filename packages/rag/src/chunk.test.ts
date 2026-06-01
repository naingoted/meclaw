import { describe, expect, it } from "vitest";

import type { KnowledgeDoc } from "@/lib/content";

import { chunkKnowledgeDocs } from "./chunk";

describe("chunkKnowledgeDocs", () => {
  it("packs whole paragraphs into a single chunk when they fit", () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "a.md",
        title: "A",
        body: "# Title\n\nAlpha beta gamma.\n\nDelta epsilon zeta.",
      },
    ];

    expect(chunkKnowledgeDocs(docs, { chunkSize: 100, overlap: 0 })).toEqual([
      {
        id: "a.md:0",
        source: "a.md",
        title: "A",
        text: "# Title Alpha beta gamma. Delta epsilon zeta.",
        ordinal: 0,
      },
    ]);
  });

  it("splits on paragraph boundaries when a chunk fills up", () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "a.md",
        title: "A",
        body: "# Title\n\nAlpha beta gamma.\n\nDelta epsilon zeta.",
      },
    ];

    expect(chunkKnowledgeDocs(docs, { chunkSize: 25, overlap: 0 })).toEqual([
      { id: "a.md:0", source: "a.md", title: "A", text: "# Title Alpha beta gamma.", ordinal: 0 },
      { id: "a.md:1", source: "a.md", title: "A", text: "Delta epsilon zeta.", ordinal: 1 },
    ]);
  });

  it("splits an oversized block on word boundaries (never mid-word)", () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "a.md",
        title: "A",
        body: "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa",
      },
    ];

    const chunks = chunkKnowledgeDocs(docs, { chunkSize: 20, overlap: 5 });

    expect(chunks.map((c) => c.text)).toEqual([
      "Alpha Beta Gamma",
      "Delta Epsilon Zeta",
      "Eta Theta Iota Kappa",
    ]);
    // no chunk exceeds chunkSize
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(20);
    }
  });

  it("carries word-aligned overlap into the next chunk", () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "a.md",
        title: "A",
        body: "aa bb cc\n\ndddddd",
      },
    ];

    expect(chunkKnowledgeDocs(docs, { chunkSize: 12, overlap: 6 })).toEqual([
      { id: "a.md:0", source: "a.md", title: "A", text: "aa bb cc", ordinal: 0 },
      { id: "a.md:1", source: "a.md", title: "A", text: "bb cc dddddd", ordinal: 1 },
    ]);
  });

  it("normalizes internal whitespace within a block", () => {
    const docs: KnowledgeDoc[] = [
      { slug: "notes.md", title: "Notes", body: "First\t\tline\n\nSecond   line" },
    ];

    expect(chunkKnowledgeDocs(docs, { chunkSize: 100, overlap: 20 })).toEqual([
      { id: "notes.md:0", source: "notes.md", title: "Notes", text: "First line Second line", ordinal: 0 },
    ]);
  });

  it("returns no chunks for an empty body", () => {
    const docs: KnowledgeDoc[] = [{ slug: "empty.md", title: "Empty", body: " \n\t " }];
    expect(chunkKnowledgeDocs(docs, { chunkSize: 20, overlap: 5 })).toEqual([]);
  });

  it("never breaks a word across chunks", () => {
    const docs: KnowledgeDoc[] = [
      { slug: "a.md", title: "A", body: "supercalifragilistic expialidocious antidisestablishment" },
    ];
    const chunks = chunkKnowledgeDocs(docs, { chunkSize: 25, overlap: 6 });

    // every token in every chunk must be a complete word from the original body
    const originalWords = new Set(docs[0].body.split(/\s+/));
    for (const chunk of chunks) {
      for (const word of chunk.text.split(" ")) {
        expect(originalWords.has(word)).toBe(true);
      }
    }
  });
});
