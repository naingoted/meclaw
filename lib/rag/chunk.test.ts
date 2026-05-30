import { describe, expect, it } from "vitest";

import type { KnowledgeDoc } from "@/lib/content";

import { chunkKnowledgeDocs } from "./chunk";

describe("chunkKnowledgeDocs", () => {
  it("splits docs into deterministic overlapping chunks with stable metadata", () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "projects/echo-clone.md",
        title: "Echo Clone",
        body: "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa",
      },
      {
        slug: "empty.md",
        title: "Empty",
        body: " \n\t ",
      },
    ];

    const chunks = chunkKnowledgeDocs(docs, {
      chunkSize: 20,
      overlap: 5,
    });

    expect(chunks).toEqual([
      {
        id: "projects/echo-clone.md:0",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: "Alpha Beta Gamma Del",
        ordinal: 0,
      },
      {
        id: "projects/echo-clone.md:1",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: "a Delta Epsilon Zeta",
        ordinal: 1,
      },
      {
        id: "projects/echo-clone.md:2",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: " Zeta Eta Theta Iota",
        ordinal: 2,
      },
      {
        id: "projects/echo-clone.md:3",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: " Iota Kappa",
        ordinal: 3,
      },
    ]);
  });

  it("normalizes internal whitespace enough to avoid empty chunks", () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "notes.md",
        title: "Notes",
        body: "First\t\tline\n\nSecond   line",
      },
    ];

    expect(chunkKnowledgeDocs(docs, { chunkSize: 100, overlap: 20 })).toEqual([
      {
        id: "notes.md:0",
        source: "notes.md",
        title: "Notes",
        text: "First line Second line",
        ordinal: 0,
      },
    ]);
  });
});
