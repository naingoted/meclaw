import type { KnowledgeDoc } from "@meclaw/core/content";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { listDocuments } from "@meclaw/core/documents";
import { describe, expect, it, vi } from "vitest";
import { seedAndIngest } from "./seed";

const DOCS: KnowledgeDoc[] = [
  { slug: "resume.md", title: "Resume", body: "# Resume\nThet, engineer." },
  { slug: "projects/x.md", title: "X", body: "# X\nA project." },
];

describe("seedAndIngest", () => {
  it("seeds content into documents (origin=seed) and ingests them once", async () => {
    const { db } = await makeTestDb();
    const ingest = vi.fn(async () => ({ chunks: 2 }));

    const res = await seedAndIngest(db as never, { loadDocs: () => DOCS, ingest });

    expect(res).toEqual({ imported: 2, ingested: 2, chunks: 4 });
    expect(ingest).toHaveBeenCalledTimes(2);
    // ingest receives the created document's id/title/body/origin
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Resume", origin: "seed" }),
    );

    const rows = await listDocuments(db as never);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.origin === "seed")).toBe(true);
    expect(rows.every((r) => r.status === "ready")).toBe(true);
    expect(rows.find((r) => r.title === "X")?.category).toBe("projects");
    expect(rows.find((r) => r.title === "Resume")?.category).toBeNull();
  });

  it("is idempotent: re-run imports 0 and re-ingests nothing when content is unchanged", async () => {
    const { db } = await makeTestDb();
    const ingest = vi.fn(async () => ({ chunks: 1 }));

    await seedAndIngest(db as never, { loadDocs: () => DOCS, ingest });
    ingest.mockClear();

    const second = await seedAndIngest(db as never, { loadDocs: () => DOCS, ingest });

    expect(second).toEqual({ imported: 0, ingested: 0, chunks: 0 });
    expect(ingest).not.toHaveBeenCalled();
  });
});
