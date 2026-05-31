import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Knowledge loader. Reads the owner's markdown corpus from `content/` and
 * returns it as structured docs for context-stuffing into the system prompt
 * (no embeddings in v1 — the corpus is tiny). Files are read once at call
 * time; edit `content/*.md` and restart the server to refresh.
 */
export type KnowledgeDoc = {
  /** Path relative to the content dir, e.g. `projects/meclaw.md`. */
  slug: string;
  /** First H1 in the file, or the slug if none. */
  title: string;
  /** Full file contents. */
  body: string;
};

const CONTENT_DIR = join(process.cwd(), "content");

function titleFrom(body: string, slug: string): string {
  const h1 = body.match(/^#\s+(.+?)\s*$/m);
  return h1 ? h1[1] : slug;
}

export function loadKnowledge(dir: string = CONTENT_DIR): KnowledgeDoc[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true }) as string[];
  } catch {
    return []; // no content dir yet — bot runs with no knowledge
  }

  return entries
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => entry.split(sep).join("/")) // normalize for stable slugs
    .sort()
    .map((slug) => {
      const body = readFileSync(join(dir, slug), "utf8").trimEnd();
      return { slug, title: titleFrom(body, slug), body };
    });
}
