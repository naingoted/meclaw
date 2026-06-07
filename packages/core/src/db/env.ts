import { z } from "zod";

/**
 * Postgres connection env parsing. Mirrors lib/ai/provider.ts#parseAiEnv:
 * a small Zod schema parsed lazily (never at module load), so importing this
 * file during build/test does not require a live DATABASE_URL.
 */
const dbEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid postgres connection URL")
    .refine((url) => url.startsWith("postgres://") || url.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a valid postgres connection URL",
    }),
});

export type DbEnv = z.infer<typeof dbEnvSchema>;

/** Parse + validate the DB environment. Throws (loud) if missing/invalid. */
export function parseDbEnv(env: Record<string, string | undefined> = process.env): DbEnv {
  return dbEnvSchema.parse({ DATABASE_URL: env.DATABASE_URL });
}
