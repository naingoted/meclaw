// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { adminBoot } = await import("@/lib/admin/boot");
    await adminBoot();
  }
}
