import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // Istanbul coverage for `fallow health --coverage`; inert without --coverage.
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
    },
  },
});
