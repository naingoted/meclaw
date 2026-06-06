-- Read-only role for @meclaw/mcp. Idempotent + CI/deploy-safe: creates the role
-- NOLOGIN if it does not exist (so `db:migrate` never fails on a fresh DB), then
-- grants SELECT only. The login + password are enabled OUT-OF-BAND and never
-- committed (see docs/ai/setup.md): `ALTER ROLE meclaw_ro WITH LOGIN PASSWORD '...'`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'meclaw_ro') THEN
    CREATE ROLE meclaw_ro NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO meclaw_ro;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO meclaw_ro;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO meclaw_ro;