import type { KnowledgeDoc } from "@meclaw/core/content";

import type { RagChunk } from "./types";

type ChunkOptions = {
  chunkSize: number;
  overlap: number;
};

/** Split a body into blocks: blank-line-separated paragraphs, whitespace-normalized. */
function splitBlocks(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length > 0);
}

/** Split an oversized block into word-aligned pieces no longer than max. */
function splitOnWords(block: string, max: number): string[] {
  const pieces: string[] = [];
  let current = "";

  for (const word of block.split(" ")) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= max) {
      current += ` ${word}`;
    } else {
      pieces.push(current);
      current = word;
    }

    // a single word longer than max: hard-split it (last resort)
    while (current.length > max) {
      pieces.push(current.slice(0, max));
      current = current.slice(max);
    }
  }

  if (current.length > 0) {
    pieces.push(current);
  }

  return pieces;
}

/** Trailing slice of a chunk, aligned to a word boundary, at most overlap chars. */
function overlapTail(text: string, overlap: number): string {
  if (overlap <= 0) {
    return "";
  }
  if (text.length <= overlap) {
    // entire chunk fits the overlap window; it is word-complete, carry it whole
    return text;
  }

  const tail = text.slice(text.length - overlap);
  const spaceIdx = tail.indexOf(" ");
  // no clean word boundary in the tail → skip overlap rather than carry a fragment
  return spaceIdx === -1 ? "" : tail.slice(spaceIdx + 1);
}

export function chunkKnowledgeDocs(docs: KnowledgeDoc[], options: ChunkOptions): RagChunk[] {
  const { chunkSize, overlap } = options;

  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }

  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be at least 0 and smaller than chunkSize");
  }

  return docs.flatMap((doc) => {
    const blocks = splitBlocks(doc.body);

    if (blocks.length === 0) {
      return [];
    }

    // expand any block larger than chunkSize into word-aligned units
    const units: string[] = [];
    for (const block of blocks) {
      if (block.length > chunkSize) {
        units.push(...splitOnWords(block, chunkSize));
      } else {
        units.push(block);
      }
    }

    const texts: string[] = [];
    let current = "";

    for (const unit of units) {
      if (current.length === 0) {
        current = unit;
      } else if (current.length + 1 + unit.length <= chunkSize) {
        current += ` ${unit}`;
      } else {
        texts.push(current);
        const tail = overlapTail(current, overlap);
        current =
          tail.length > 0 && tail.length + 1 + unit.length <= chunkSize ? `${tail} ${unit}` : unit;
      }
    }

    if (current.length > 0) {
      texts.push(current);
    }

    return texts.map((text, ordinal) => ({
      id: `${doc.slug}:${ordinal}`,
      source: doc.slug,
      title: doc.title,
      text,
      ordinal,
    }));
  });
}
