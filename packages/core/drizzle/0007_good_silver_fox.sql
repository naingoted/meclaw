CREATE TABLE "retrieval_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"messageId" text NOT NULL,
	"conversationId" text NOT NULL,
	"query" text NOT NULL,
	"intent" text NOT NULL,
	"grounded" boolean NOT NULL,
	"stuffed" boolean NOT NULL,
	"topScore" double precision,
	"answerUsed" boolean NOT NULL,
	"chunks" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_retrieval_events_messageId" ON "retrieval_events" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "idx_retrieval_events_conversationId" ON "retrieval_events" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "idx_retrieval_events_createdAt" ON "retrieval_events" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_retrieval_events_intent" ON "retrieval_events" USING btree ("intent");