import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    // The PGlite-backed admin/db tests (documents, stats, ingest-runner,
    // seed-documents) spin up a WASM Postgres and can blow the 5s default when
    // `turbo run … build test` saturates the CPU. Generous timeouts keep them
    // green under load without serializing the whole (mostly fast) suite.
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // Glob form so nested copies are excluded too — notably sibling git
    // worktrees under .claude, which carry their own node_modules + tests and
    // would otherwise be scanned (1700+ files instead of this project's ~17).
    // `packages/**` is excluded so the legacy-root member only runs the app's
    // own tests; each workspace package is tested by its own vitest config
    // (turbo run test fans out), avoiding duplicate runs of the PGlite suite.
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.claude/**",
      "**/packages/**",
    ],
  },
});
