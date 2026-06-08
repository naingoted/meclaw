CREATE TABLE "embed_clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"publicToken" text NOT NULL,
	"name" text NOT NULL,
	"allowedOrigins" text[] DEFAULT '{}' NOT NULL,
	"rateLimitPerMin" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_embed_clients_publicToken" ON "embed_clients" USING btree ("publicToken");--> statement-breakpoint
CREATE INDEX "idx_embed_clients_revokedAt" ON "embed_clients" USING btree ("revokedAt");