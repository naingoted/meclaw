import { readdirSync } from "node:fs";
import { join, sep } from "node:path";

import { loadKnowledge, type KnowledgeDoc } from "../../content";

import { loadPdf } from "./pdf";

const CONTENT_DIR = join(process.cwd(), "content");

/**
 * Loads every ingestable doc under `dir`: markdown via loadKnowledge (sync),
 * plus every PDF via loadPdf. PDF slugs are normalized to the content-relative
 * path (matching loadKnowledge's slug convention). Result is sorted by slug.
 */
export async function loadIngestDocs(dir: string = CONTENT_DIR): Promise<KnowledgeDoc[]> {
  const markdown = loadKnowledge(dir);

  let entries: string[] = [];
  try {
    entries = readdirSync(dir, { recursive: true }) as string[];
  } catch {
    entries = [];
  }

  const pdfSlugs = entries
    .filter((entry) => entry.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.split(sep).join("/"))
    .sort();

  const pdfs = await Promise.all(
    pdfSlugs.map(async (slug) => {
      const doc = await loadPdf(join(dir, slug));
      return { ...doc, slug };
    }),
  );

  return [...markdown, ...pdfs].sort((a, b) => a.slug.localeCompare(b.slug));
}

export { loadPdf } from "./pdf";
