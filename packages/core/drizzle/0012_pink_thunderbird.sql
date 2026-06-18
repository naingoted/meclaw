CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"passwordHash" text NOT NULL,
	"role" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"lastLoginAt" timestamp with time zone,
	CONSTRAINT "admin_users_role_check" CHECK ("admin_users"."role" in ('super_admin', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_admin_users_username" ON "admin_users" USING btree ("username");