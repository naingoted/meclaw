import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Generous timeouts (30s) keep the suite green when `turbo run … build test`
    // saturates the CPU across the workspace. The chat suite itself is fast
    // (jsdom, no DB), but it shares a turbo run with heavier packages.
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    // Istanbul coverage for `fallow health --coverage`; inert without --coverage.
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
    },
    // Inline drizzle-orm and postgres to avoid module resolution issues in jsdom
    server: {
      deps: {
        inline: ["drizzle-orm", "postgres"],
      },
    },
  },
});
