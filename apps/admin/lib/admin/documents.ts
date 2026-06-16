// Document CRUD lives in @meclaw/core/documents so the seed CLI (@meclaw/rag)
// and the admin app share one source of truth. Re-exported here to keep the
// app's `@/lib/admin/documents` import path stable.
export {
  contentHash,
  createDocument,
  type DocumentInput,
  type DocumentOrigin,
  type DocumentRow,
  deleteDocument,
  getDocument,
  isDirty,
  listDocuments,
  markIngested,
  updateDocument,
} from "@meclaw/core/documents";
