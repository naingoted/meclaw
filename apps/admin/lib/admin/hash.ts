import { createHash } from "node:crypto";

/** Stable content hash of a document body — used to skip no-op re-ingests. */
export function contentHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
