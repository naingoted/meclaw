import type { KnowledgeDoc } from "../content";

import type { RagChunk } from "./types";

type ChunkOptions = {
  chunkSize: number;
  overlap: number;
};

function normalizeText(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function chunkKnowledgeDocs(
  docs: KnowledgeDoc[],
  options: ChunkOptions,
): RagChunk[] {
  const { chunkSize, overlap } = options;

  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }

  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be at least 0 and smaller than chunkSize");
  }

  const step = chunkSize - overlap;

  return docs.flatMap((doc) => {
    const text = normalizeText(doc.body);

    if (!text) {
      return [];
    }

    const chunks: RagChunk[] = [];

    for (let start = 0, ordinal = 0; start < text.length; start += step, ordinal += 1) {
      chunks.push({
        id: `${doc.slug}:${ordinal}`,
        source: doc.slug,
        title: doc.title,
        text: text.slice(start, start + chunkSize),
        ordinal,
      });
    }

    return chunks;
  });
}
