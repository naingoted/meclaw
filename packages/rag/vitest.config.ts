import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // The seed test spins a PGlite instance via makeTestDb (migrations + DDL),
    // which can exceed the 5s default under parallel load — match core/admin.
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    // Istanbul coverage for `fallow health --coverage`; inert without --coverage.
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
    },
  },
});
