import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Istanbul coverage for `fallow health --coverage`; inert without --coverage.
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
    },
  },
});
