import { Suspense } from "react";
import { DocumentsClient } from "@/components/admin/documents-client";
import { CorpusStrip } from "@/components/admin/corpus-strip";

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
