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
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // Glob form so nested copies are excluded too — notably sibling git
    // worktrees under .claude, which carry their own node_modules + tests and
    // would otherwise be scanned (1700+ files instead of this project's ~17).
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/.claude/**"],
  },
});
