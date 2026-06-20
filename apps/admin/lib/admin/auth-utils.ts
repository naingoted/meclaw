import { initDb } from "@meclaw/core/db";
import { authorizeAdminCredentials } from "./users";

export async function authorizeCredentials(creds: {
  username?: unknown;
  password?: unknown;
}): Promise<{ id: string; name: string; username: string; role: "super_admin" | "admin" } | null> {
  const username = typeof creds.username === "string" ? creds.username : "";
  const password = typeof creds.password === "string" ? creds.password : "";
  if (!username || !password) return null;
  const user = await authorizeAdminCredentials(await initDb(), username, password);
  if (!user) return null;
  return { id: user.id, name: user.username, username: user.username, role: user.role };
}
