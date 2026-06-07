CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"useCase" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"modelSet" jsonb,
	"subtasks" integer DEFAULT 0 NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"toolCalls" integer DEFAULT 0 NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"report" jsonb,
	"evalRecords" jsonb,
	"error" text,
	"startedAt" timestamp with time zone NOT NULL,
	"endedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"runId" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"toolCalls" jsonb,
	"validationVerdict" text,
	"score" double precision,
	"retryIndex" integer,
	"durationMs" integer,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_startedAt" ON "agent_runs" USING btree ("startedAt");--> statement-breakpoint
CREATE INDEX "idx_agent_steps_runId" ON "agent_steps" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "idx_agent_steps_role" ON "agent_steps" USING btree ("role");