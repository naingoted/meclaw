import { Suspense } from "react";
import { CorpusStrip } from "@/components/admin/corpus-strip";
import { DocumentsClient } from "@/components/admin/documents-client";

export default function DocumentsPage() {
  return (
    <div>
      <CorpusStrip />
      <Suspense fallback={null}>
        <DocumentsClient />
      </Suspense>
    </div>
  );
}
