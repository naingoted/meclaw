import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { seedDocuments } from "./seed-documents";
import { listDocuments } from "@/lib/admin/documents";

describe("seedDocuments", () => {
  it("imports knowledge docs and is idempotent by contentHash", async () => {
    const { db } = await makeTestDb();
    const docs = [{ slug: "resume.md", title: "Resume", body: "# Resume" }, { slug: "projects/x.md", title: "X", body: "# X" }];
    const first = await seedDocuments(db, { loadDocs: () => docs });
    expect(first.imported).toBe(2);
    const second = await seedDocuments(db, { loadDocs: () => docs }); // re-run, same content
    expect(second.imported).toBe(0);
    expect(await listDocuments(db)).toHaveLength(2);
  });
});
