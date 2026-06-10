ALTER TABLE "documents" ADD COLUMN "corpusVersion" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "requestId" text;--> statement-breakpoint
ALTER TABLE "gap_clusters" ADD COLUMN "resolvedAtCorpusVersion" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_documents_requestId" ON "documents" USING btree ("requestId");