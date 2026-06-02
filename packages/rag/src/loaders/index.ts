import { readdirSync } from "node:fs";
import { join, sep } from "node:path";

import { contentDir, loadKnowledge, type KnowledgeDoc } from "@meclaw/core/content";

import { loadPdf } from "./pdf";
import { loadWorkImpactDocs } from "./work-impact";

/**
 * Loads every ingestable doc under `dir`: markdown via loadKnowledge (sync),
 * plus every PDF via loadPdf, plus every work-impact pack found under the
 * sibling `data/` dir (`<dir>/../data/work_impact_<company>/`). PDF slugs are
 * normalized to the content-relative path (matching loadKnowledge's slug
 * convention). Result is sorted by slug.
 */
export async function loadIngestDocs(dir: string = contentDir()): Promise<KnowledgeDoc[]> {
  const markdown = loadKnowledge(dir);
  const workImpact = loadWorkImpactDocs(join(dir, "..", "data"));

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

  return [...markdown, ...pdfs, ...workImpact].sort((a, b) => a.slug.localeCompare(b.slug));
}

export { loadPdf } from "./pdf";
export { loadWorkImpactDocs } from "./work-impact";
