import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({ db: async () => ({}) }));
vi.mock("@/lib/admin/corpus", () => ({
  getCorpusState: vi.fn(async () => ({
    version: 7,
    documents: 6,
    chunks: 19,
    lastIngestedAt: "2026-06-02T18:00:00.000Z",
    embedModel: "nomic-embed-text",
  })),
}));

import { getCorpusState } from "@/lib/admin/corpus";
import { GET } from "./route";

describe("corpus API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET returns the corpus state", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ version: 7, documents: 6, chunks: 19 });
    expect(getCorpusState).toHaveBeenCalled();
  });

  it("GET degrades to version:null when getCorpusState throws", async () => {
    (getCorpusState as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db down"),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: null,
      documents: null,
      chunks: null,
      lastIngestedAt: null,
      embedModel: "nomic-embed-text",
    });
    expect(getCorpusState).toHaveBeenCalled();
  });
});
