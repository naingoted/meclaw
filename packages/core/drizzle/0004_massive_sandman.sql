CREATE TABLE "chat_misses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"messageId" text NOT NULL,
	"conversationId" text NOT NULL,
	"clusterId" uuid NOT NULL,
	"query" text NOT NULL,
	"reason" text NOT NULL,
	"topScore" double precision,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gap_clusters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text,
	"centroid" vector(768) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"exemplarQuery" text,
	"resolvedDocumentId" uuid,
	"resolvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chat_misses_messageId" ON "chat_misses" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "idx_chat_misses_clusterId" ON "chat_misses" USING btree ("clusterId");--> statement-breakpoint
CREATE INDEX "idx_chat_misses_conversationId" ON "chat_misses" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "idx_chat_misses_createdAt" ON "chat_misses" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_gap_clusters_centroid" ON "gap_clusters" USING hnsw ("centroid" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_gap_clusters_status" ON "gap_clusters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_gap_clusters_count" ON "gap_clusters" USING btree ("count");