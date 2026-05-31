// Run the production build locally the same way the Docker runner stage does.
//
// next.config.ts sets `output: "standalone"`, so `next start` does NOT serve the
// real prod artifact (it warns and ignores the standalone bundle). The standalone
// server lives at .next/standalone/server.js, but `next build` does not copy
// public/ or .next/static into it — the Dockerfile does that explicitly
// (see Dockerfile runner stage). We replicate those copies, then boot server.js.
//
// PORT / HOSTNAME pass through via the inherited env (e.g. `PORT=3001 pnpm start`).
//
// Persistence requires DATABASE_URL (Postgres) and an already-migrated schema.
// This lean runner does NOT migrate — run `pnpm db:migrate` first. If the DB is
// unreachable, chat still works (persistence is best-effort).
import { cpSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const STANDALONE = ".next/standalone";

if (!existsSync(`${STANDALONE}/server.js`)) {
  console.error(
    "No standalone build found at .next/standalone/server.js — run `pnpm build` first.",
  );
  process.exit(1);
}

// Mirror Dockerfile: COPY public ./public  and  COPY .next/static ./.next/static
if (existsSync("public")) {
  cpSync("public", `${STANDALONE}/public`, { recursive: true });
}
cpSync(".next/static", `${STANDALONE}/.next/static`, { recursive: true });

const result = spawnSync("node", [`${STANDALONE}/server.js`], { stdio: "inherit" });
process.exit(result.status ?? 0);
