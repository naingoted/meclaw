import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { parseDbEnv } from "./env";

const MIGRATION_LOCK_ID = 72437901;

/**
 * Apply pending Drizzle migrations from ./drizzle to the Postgres in
 * DATABASE_URL. Fail-fast: throws on any migration error so callers
 * (CLI / deploy) never start serving against an unmigrated schema.
 */
export async function runMigrations(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? parseDbEnv().DATABASE_URL;
  const sql = postgres(url, { max: 1 });
  let lockAcquired = false;
  try {
    await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    lockAcquired = true;
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    if (lockAcquired) {
      await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    }
    await sql.end();
  }
}
