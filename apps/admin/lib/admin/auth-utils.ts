import { verifyPassword } from "./password";

export async function authorizeCredentials(creds: {
  username?: unknown;
  password?: unknown;
}): Promise<{ id: string; name: string } | null> {
  const username = typeof creds.username === "string" ? creds.username : "";
  const password = typeof creds.password === "string" ? creds.password : "";
  const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
  const hash = process.env.ADMIN_PASSWORD_HASH ?? "";
  if (username !== expectedUser || !hash) return null;
  if (!(await verifyPassword(password, hash))) return null;
  return { id: expectedUser, name: expectedUser };
}
