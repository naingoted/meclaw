CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"conversationId" text NOT NULL,
	"email" text,
	"phone" text,
	"triggerQuestion" text,
	"trigger" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_contact_check" CHECK ("leads"."email" is not null or "leads"."phone" is not null)
);
--> statement-breakpoint
CREATE INDEX "idx_leads_conversationId" ON "leads" USING btree ("conversationId");