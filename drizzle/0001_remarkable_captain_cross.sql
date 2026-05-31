CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "rag_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"ordinal" integer NOT NULL,
	"embedding" vector(768) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_rag_chunks_source" ON "rag_chunks" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_rag_chunks_embedding" ON "rag_chunks" USING hnsw ("embedding" vector_cosine_ops);