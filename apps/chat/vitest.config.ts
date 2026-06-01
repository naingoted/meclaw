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
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
    ],
  },
});
