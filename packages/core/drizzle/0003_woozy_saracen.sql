CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"summary" text NOT NULL,
	"meta" jsonb,
	"actorIp" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"kind" text DEFAULT 'markdown' NOT NULL,
	"category" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"contentHash" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"lastIngestedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"documentId" uuid,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"chunksWritten" integer,
	"createdAt" timestamp with time zone NOT NULL,
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"agents" jsonb NOT NULL,
	"shared" jsonb NOT NULL,
	"rag" jsonb NOT NULL,
	"public" jsonb NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
