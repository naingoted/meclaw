import { describe, expect, it, vi } from "vitest";

import type { RagChunk } from "./types";

import { QdrantClient } from "./qdrant";

describe("QdrantClient", () => {
  it("creates the collection with the configured vector size", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ result: true }), { status: 200 }));

    const client = new QdrantClient({
      url: "http://localhost:6333",
      collection: "echo_clone_knowledge",
      vectorSize: 768,
      fetchFn,
    });

    await client.ensureCollection();

    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:6333/collections/echo_clone_knowledge",
      expect.objectContaining({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vectors: {
            size: 768,
            distance: "Cosine",
          },
        }),
      }),
    );
  });

  it("upserts points with wait=true and searches payloads back into chunk results", async () => {
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify({ result: { operation_id: 1 } }), { status: 200 }))
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              result: [
                {
                  id: "6a9da648-a71a-4684-a3cd-2addff56e18c",
                  score: 0.9876,
                  payload: {
                    id: "projects/echo-clone.md:0",
                    source: "projects/echo-clone.md",
                    title: "Echo Clone",
                    text: "Chunk body",
                    ordinal: 0,
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      );

    const client = new QdrantClient({
      url: "http://localhost:6333",
      collection: "echo_clone_knowledge",
      vectorSize: 3,
      fetchFn,
    });

    const points: Array<RagChunk & { embedding: number[] }> = [
      {
        id: "projects/echo-clone.md:0",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: "Chunk body",
        ordinal: 0,
        embedding: [0.1, 0.2, 0.3],
      },
    ];

    await client.upsert(points);
    const results = await client.search([0.4, 0.5, 0.6], 4);

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "http://localhost:6333/collections/echo_clone_knowledge/points?wait=true",
      expect.objectContaining({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          points: [
            {
              id: "6a9da648-a71a-4684-a3cd-2addff56e18c",
              vector: [0.1, 0.2, 0.3],
              payload: {
                id: "projects/echo-clone.md:0",
                source: "projects/echo-clone.md",
                title: "Echo Clone",
                text: "Chunk body",
                ordinal: 0,
              },
            },
          ],
        }),
      }),
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "http://localhost:6333/collections/echo_clone_knowledge/points/search",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vector: [0.4, 0.5, 0.6],
          limit: 4,
          with_payload: true,
        }),
      }),
    );
    expect(results).toEqual([
      {
        id: "projects/echo-clone.md:0",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: "Chunk body",
        ordinal: 0,
        score: 0.9876,
      },
    ]);
  });
});

describe("QdrantClient.deleteBySource", () => {
  it("posts a delete request filtered by payload source", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ result: {}, status: "ok" }), { status: 200 }));
    const client = new QdrantClient({ url: "http://qdrant.test", collection: "kb", fetchFn });

    await client.deleteBySource("resume.pdf");

    expect(fetchFn).toHaveBeenCalledWith(
      "http://qdrant.test/collections/kb/points/delete?wait=true",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filter: { must: [{ key: "source", match: { value: "resume.pdf" } }] },
        }),
      }),
    );
  });
});
