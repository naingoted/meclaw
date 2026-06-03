import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // The PGlite-backed makeTestDb suite spins up a WASM Postgres per file and
    // is slow to initialize. Serialize files and give a generous timeout so it
    // stays green even when `turbo run test` saturates the CPU across packages.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    // Istanbul coverage for `fallow health --coverage`; inert without --coverage.
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
    },
  },
});
