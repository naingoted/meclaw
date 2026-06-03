import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { KnowledgeDoc } from "@meclaw/core/content";

/**
 * Work-impact loader.
 *
 * Each company's history lives in its own pack under `data/`, by convention
 * `data/work_impact_<company>/` (e.g. `work_impact_incube8`). A pack holds a
 * `04_rag_entries.json` array of structured impact entries. This loader
 * auto-discovers every such directory, renders each pack into one
 * structure-aware markdown `KnowledgeDoc`, and returns them sorted by slug.
 *
 * Adding shopback / asiaone later = drop a `data/work_impact_<company>/` folder
 * with its own `04_rag_entries.json`. No code change here.
 *
 * The rendered body uses an H1 per company and an H2 per work category so the
 * paragraph-aware chunker (`lib/rag/chunk.ts`) splits cleanly on category
 * boundaries. Slug is `work/<company>` so retrieval sources stay legible.
 */

const PACK_PREFIX = "work_impact_";
const ENTRIES_FILE = "04_rag_entries.json";

/** One structured impact entry, as stored in `04_rag_entries.json`. */
type WorkImpactEntry = {
  id?: string;
  category?: string;
  period?: string | number;
  size?: string;
  summary?: string;
  context_for_non_internal_audience?: string;
  measurable_impact?: Array<string | Record<string, string>>;
  related_initiatives?: string[];
  confidence?: string;
};

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "revenue_billing_monetisation" → "Revenue Billing Monetisation". */
function prettifyCategory(category: string): string {
  return titleCase(category);
}

/** Flatten a measurable-impact item (string, or single-key object) to one line. */
function impactLine(item: string | Record<string, string>): string {
  if (typeof item === "string") {
    return item;
  }

  return Object.entries(item)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function renderEntryHeading(entry: WorkImpactEntry, index: number): string {
  const heading = prettifyCategory(entry.category ?? entry.id ?? `Entry ${index + 1}`);
  const meta = [entry.period, entry.size].filter(Boolean).join(", ");
  return meta.length > 0 ? `## ${heading} (${meta})` : `## ${heading}`;
}

function renderMeasurableImpact(
  impact: WorkImpactEntry["measurable_impact"],
): string | undefined {
  if (!impact?.length) {
    return undefined;
  }

  const bullets = impact.map((item) => `- ${impactLine(item)}`).join("\n");
  return `Measurable impact:\n${bullets}`;
}

function entryDetailBlocks(entry: WorkImpactEntry): string[] {
  return [
    entry.summary,
    entry.context_for_non_internal_audience
      ? `Context: ${entry.context_for_non_internal_audience}`
      : undefined,
    renderMeasurableImpact(entry.measurable_impact),
    entry.related_initiatives?.length
      ? `Related initiatives: ${entry.related_initiatives.join(", ")}.`
      : undefined,
    entry.confidence ? `Confidence: ${entry.confidence}.` : undefined,
  ].filter((block): block is string => Boolean(block));
}

/** Render one entry as a markdown section: H2 heading + blank-line-separated blocks. */
function renderEntry(entry: WorkImpactEntry, index: number): string {
  return [renderEntryHeading(entry, index), ...entryDetailBlocks(entry)].join("\n\n");
}

function renderPack(company: string, entries: WorkImpactEntry[]): KnowledgeDoc {
  const title = `Work Impact — ${titleCase(company)}`;
  const sections = entries.map((entry, index) => renderEntry(entry, index));
  const body = [`# ${title}`, ...sections].join("\n\n");

  return { slug: `work/${company}`, title, body };
}

function readEntries(packDir: string): WorkImpactEntry[] | null {
  let raw: string;
  try {
    raw = readFileSync(join(packDir, ENTRIES_FILE), "utf8");
  } catch {
    return null; // pack without an entries file — skip
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // malformed JSON — skip rather than break the whole ingest
  }

  return Array.isArray(parsed) ? (parsed as WorkImpactEntry[]) : null;
}

/**
 * Loads every `data/work_impact_<company>/` pack under `baseDir` as one
 * `KnowledgeDoc` per company. Missing `baseDir`, packs without a valid
 * `04_rag_entries.json`, and empty packs are skipped. Sorted by slug.
 */
export function loadWorkImpactDocs(baseDir: string): KnowledgeDoc[] {
  let entries: string[];
  try {
    entries = readdirSync(baseDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith(PACK_PREFIX))
      .map((dirent) => dirent.name);
  } catch {
    return []; // no data dir — nothing to load
  }

  const docs: KnowledgeDoc[] = [];
  for (const dirName of entries) {
    const company = dirName.slice(PACK_PREFIX.length);
    if (company.length === 0) {
      continue;
    }

    const packEntries = readEntries(join(baseDir, dirName));
    if (!packEntries || packEntries.length === 0) {
      continue;
    }

    docs.push(renderPack(company, packEntries));
  }

  return docs.sort((a, b) => a.slug.localeCompare(b.slug));
}
