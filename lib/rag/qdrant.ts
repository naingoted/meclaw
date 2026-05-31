import { createHash } from "node:crypto";

import type { RagChunk, RagSearchResult, VectorStoreClient } from "./types";

type FetchFn = typeof fetch;

type QdrantClientOptions = {
  url?: string;
  collection?: string;
  vectorSize?: number;
  fetchFn?: FetchFn;
};

type QdrantSearchHit = {
  id: string | number;
  score: number;
  payload?: {
    id?: unknown;
    source?: unknown;
    title?: unknown;
    text?: unknown;
    ordinal?: unknown;
  };
};

function pointIdFromChunkId(chunkId: string): string {
  const hash = createHash("sha1").update(chunkId).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

export class QdrantClient implements VectorStoreClient {
  private readonly url: string;
  private readonly collection: string;
  private readonly vectorSize: number;
  private readonly fetchFn: FetchFn;

  constructor(options: QdrantClientOptions = {}) {
    this.url = (options.url ?? "http://localhost:6333").replace(/\/+$/, "");
    this.collection = options.collection ?? "meclaw_knowledge";
    this.vectorSize = options.vectorSize ?? 768;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async ensureCollection(): Promise<void> {
    const response = await this.fetchFn(`${this.url}/collections/${this.collection}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vectors: {
          size: this.vectorSize,
          distance: "Cosine",
        },
      }),
    });

    if (!response.ok && response.status !== 409) {
      throw new Error(`Qdrant request failed with status ${response.status} ${response.statusText}`);
    }
  }

  async upsert(points: Array<RagChunk & { embedding: number[] }>): Promise<void> {
    await this.request(`/collections/${this.collection}/points?wait=true`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        points: points.map((point) => ({
          id: pointIdFromChunkId(point.id),
          vector: point.embedding,
          payload: {
            id: point.id,
            source: point.source,
            title: point.title,
            text: point.text,
            ordinal: point.ordinal,
          },
        })),
      }),
    });
  }

  async search(vector: number[], limit: number): Promise<RagSearchResult[]> {
    const data = (await this.request(`/collections/${this.collection}/points/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
      }),
    })) as { result?: unknown };

    const results = Array.isArray(data.result) ? data.result : [];

    return results.flatMap((item) => {
      const hit = item as QdrantSearchHit;

      if (
        typeof hit.id !== "string" ||
        typeof hit.score !== "number" ||
        typeof hit.payload?.id !== "string" ||
        typeof hit.payload?.source !== "string" ||
        typeof hit.payload?.title !== "string" ||
        typeof hit.payload?.text !== "string" ||
        typeof hit.payload?.ordinal !== "number"
      ) {
        return [];
      }

      return [
        {
          id: hit.payload.id,
          source: hit.payload.source,
          title: hit.payload.title,
          text: hit.payload.text,
          ordinal: hit.payload.ordinal,
          score: hit.score,
        },
      ];
    });
  }

  async deleteBySource(source: string): Promise<void> {
    await this.request(`/collections/${this.collection}/points/delete?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: { must: [{ key: "source", match: { value: source } }] },
      }),
    });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchFn(`${this.url}${path}`, init);

    if (!response.ok) {
      throw new Error(`Qdrant request failed with status ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
