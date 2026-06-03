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
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
    ],
    // Istanbul format (not v8) so `fallow health --coverage` gets exact CRAP
    // scores instead of export-reference estimates. Inert unless `--coverage`
    // is passed, so plain `pnpm test` is unaffected. Writes
    // ./coverage/coverage-final.json; the root `coverage` script merges all
    // packages' files for fallow.
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
    },
  },
});
