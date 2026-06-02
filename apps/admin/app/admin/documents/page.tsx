import { DocumentsClient } from "@/components/admin/documents-client";
import { CorpusStrip } from "@/components/admin/corpus-strip";

export default function DocumentsPage() {
  return (
    <div>
      <CorpusStrip />
      <DocumentsClient />
    </div>
  );
}
