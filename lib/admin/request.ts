import { initDb } from "@/lib/db";

export { adminGuard } from "./guard";

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

export async function db() {
  return initDb();
}
