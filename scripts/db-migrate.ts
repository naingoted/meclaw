// One-shot migration runner: `pnpm db:migrate`.
// Applies ./drizzle to DATABASE_URL, then exits.
import { runMigrations } from "../lib/db/migrate";

runMigrations()
  .then(() => {
    console.log("[db] migrations applied");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[db] migration failed:", err);
    process.exit(1);
  });
