import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 resume tokens bind a conversationId to an embedClientId.
 * The client stores the token in localStorage; the server re-checks it on
 * `GET /api/chat/history`. A bare conversationId UUID cannot read history.
 *
 * Format: hex(payload) + "." + hex(hmac). No expiry in v1 (defers to a later
 * spec). Constant-time compare on verify.
 */

const DIGEST = "sha256";
const DIGEST_HEX_LEN = 64; // sha256 => 64 hex chars

function secret(): string {
  return process.env.RESUME_TOKEN_SECRET ?? "";
}

/** True only in development/test — never in production. */
function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function signResumeToken(input: { conversationId: string; embedClientId: string }): string {
  const s = secret();
  const payload = Buffer.from(`${input.conversationId}:${input.embedClientId}`, "utf8").toString(
    "hex",
  );
  if (!s) {
    if (!isDev()) throw new Error("RESUME_TOKEN_SECRET is required in production");
    return `${payload}.insecure`;
  }
  const mac = createHmac(DIGEST, s).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifyResumeToken(input: {
  token: string;
  conversationId: string;
  embedClientId: string;
}): boolean {
  const s = secret();
  const [payload, mac] = input.token.split(".");
  if (!payload || !mac) return false;
  const expectedPayload = Buffer.from(
    `${input.conversationId}:${input.embedClientId}`,
    "utf8",
  ).toString("hex");
  if (payload !== expectedPayload) return false;
  // Dev/test fallback: accept unsigned `.insecure` tokens only outside production.
  // In production, a missing RESUME_TOKEN_SECRET is a hard failure (sign throws,
  // and verify rejects all tokens) — fail-closed, not fail-open.
  if (!s) return isDev() && mac === "insecure";
  if (mac.length !== DIGEST_HEX_LEN) return false;
  const expectedMac = createHmac(DIGEST, s).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expectedMac, "hex"));
  } catch {
    return false;
  }
}
