// REQUIRED — do not delete. Load-bearing despite looking like a no-op.
//
// `next.config.ts` sets `outputFileTracingRoot` to the monorepo root, which makes
// this app's `next build` pick up the repo-root `instrumentation.ts` (which does
// `import("@/lib/admin/boot")`). Inside apps/chat, `@/` aliases to apps/chat/, so
// that admin import resolves to a path that doesn't exist here and fails the build.
// This app-local file shadows the repo-root one. The chat app needs no startup hooks.
export async function register() {
  // no chat-specific boot logic
}
