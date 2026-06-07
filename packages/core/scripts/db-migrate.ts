// One-shot migration runner: `pnpm db:migrate`.
// Applies ./drizzle to DATABASE_URL, then exits.
//
// Load packages/core/.env first so DATABASE_URL is available for local runs.
// Anchored to this file's dir (not cwd) so it resolves no matter where the
// script is invoked from. dotenv never overrides already-set process.env, so
// CI/docker (which export DATABASE_URL directly) are unaffected, and a missing
// .env is a silent no-op.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { runMigrations } from "../src/db/migrate";

// runMigrations reads DATABASE_URL lazily (parseDbEnv runs inside the call),
// so loading the .env here — before the call below — is sufficient.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

runMigrations()
  .then(() => {
    console.log("[db] migrations applied");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[db] migration failed:", err);
    process.exit(1);
  });
