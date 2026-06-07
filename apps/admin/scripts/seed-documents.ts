import { type KnowledgeDoc, loadKnowledge } from "@meclaw/core/content";
import type { Db } from "@meclaw/core/db/types";
import { createDocument, listDocuments } from "../lib/admin/documents";
import { contentHash } from "../lib/admin/hash";

type SeedOptions = { loadDocs?: () => KnowledgeDoc[] };

/** Import content/**.md into `documents`. Idempotent: skips docs whose body hash already exists. */
export async function seedDocuments(db: Db, opts: SeedOptions = {}): Promise<{ imported: number }> {
  const docs = (opts.loadDocs ?? loadKnowledge)();
  const existing = new Set((await listDocuments(db)).map((d) => d.contentHash));
  let imported = 0;
  for (const doc of docs) {
    if (existing.has(contentHash(doc.body))) continue;
    const category = doc.slug.includes("/") ? doc.slug.split("/")[0] : null;
    await createDocument(
      db,
      { title: doc.title, body: doc.body, category: category ?? undefined, origin: "seed" },
      "seed",
    );
    imported++;
  }
  return { imported };
}

// CLI entry: `pnpm seed:docs`
if (process.argv[1]?.includes("seed-documents")) {
  (async () => {
    const { initDb } = await import("@meclaw/core/db");
    const { imported } = await seedDocuments(await initDb());
    console.log(`[seed] imported ${imported} documents`);
    process.exit(0);
  })();
}
