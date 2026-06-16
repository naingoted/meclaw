import type { KnowledgeDoc } from "@meclaw/core/content";
import type { Db } from "@meclaw/core/db/types";
import {
  contentHash,
  createDocument,
  isDirty,
  listDocuments,
  markIngested,
} from "@meclaw/core/documents";
import {
  type IngestDocumentOptions,
  type IngestDocumentResult,
  ingestDocument,
} from "./ingest-document";
import { loadIngestDocs } from "./loaders";

type IngestFn = (
  doc: { id: string; title: string; body: string; origin: string },
  options?: IngestDocumentOptions,
) => Promise<IngestDocumentResult>;

export type SeedOptions = {
  /** Override the corpus loader (defaults to markdown + PDFs + work-impact packs). */
  loadDocs?: () => KnowledgeDoc[] | Promise<KnowledgeDoc[]>;
  /** Override the per-document ingester (tests inject a stub). */
  ingest?: IngestFn;
  /** Store/embedder for the real ingest (passed through to ingestDocument). */
  ingestOptions?: IngestDocumentOptions;
};

export type SeedResult = { imported: number; ingested: number; chunks: number };

/**
 * Canonical first-run / re-seed path: import the corpus (markdown + PDFs +
 * work-impact packs under `content/`) into the `documents` table (origin=seed,
 * admin-manageable) and embed each dirty doc into pgvector as `document:<id>`
 * chunks — the SAME path the admin UI uses, so there is one writer and no
 * file-slug / document-uuid split. Idempotent: a doc whose body hash already
 * exists is skipped, and only dirty docs (never-ingested or edited) are re-embedded.
 */
export async function seedAndIngest(db: Db, opts: SeedOptions = {}): Promise<SeedResult> {
  const load = opts.loadDocs ?? loadIngestDocs;
  const ingest = opts.ingest ?? ((doc) => ingestDocument(doc, opts.ingestOptions));

  const docs = await load();
  const seenHashes = new Set((await listDocuments(db)).map((d) => d.contentHash));
  let imported = 0;
  for (const doc of docs) {
    if (seenHashes.has(contentHash(doc.body))) continue;
    const category = doc.slug.includes("/") ? doc.slug.split("/")[0] : undefined;
    await createDocument(
      db,
      { title: doc.title, body: doc.body, category, origin: "seed" },
      "seed",
    );
    imported++;
  }

  const dirty = (await listDocuments(db)).filter(isDirty);
  let chunks = 0;
  for (const d of dirty) {
    const { chunks: n } = await ingest({
      id: d.id,
      title: d.title,
      body: d.body,
      origin: d.origin,
    });
    await markIngested(db, d.id);
    chunks += n;
  }

  return { imported, ingested: dirty.length, chunks };
}
