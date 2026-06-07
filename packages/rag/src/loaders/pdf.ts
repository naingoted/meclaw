import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { KnowledgeDoc } from "@meclaw/core/content";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Loads a PDF file into a KnowledgeDoc for the RAG ingest pipeline.
 * Text is extracted with unpdf (pdfjs under the hood). The slug is the
 * file's basename; callers (loadIngestDocs) may override it with a
 * content-relative path.
 *
 * Title is derived from the filename stem, NOT the body: unpdf's
 * extractText({ mergePages: true }) returns space-joined text with no line
 * structure, so there is no reliable "first line" to use as a title.
 */
function titleFromFilename(name: string): string {
  const pretty = name
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return pretty.length > 0 ? pretty : name;
}

export async function loadPdf(path: string): Promise<KnowledgeDoc> {
  const buffer = await readFile(path);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const body = text.trim();

  const slug = basename(path);
  const title = titleFromFilename(slug);

  return { slug, title, body };
}
