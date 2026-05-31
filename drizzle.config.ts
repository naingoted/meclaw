import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` diffs lib/db/schema.ts -> ./drizzle SQL (no DB needed).
// `migrate`/`push` use dbCredentials. The local default keeps `generate`
// working out of the box; real credentials come from DATABASE_URL.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://meclaw:meclaw@localhost:5432/meclaw",
  },
});
