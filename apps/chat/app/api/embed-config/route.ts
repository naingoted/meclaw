import { getCachedUnionOrigins, setCachedUnionOrigins } from "@meclaw/core/embed-cache";
import { getSettings, getSettingsVersion, toEmbedClientConfig } from "@meclaw/core/settings";
import {
  getChatDb,
  isAllowedOrigin,
  loadUnionAllowedOrigins,
  resolveEmbedClient,
  resolveVerifiedOrigin,
} from "@/lib/embed/auth";
import { corsPreflightHeaders, jsonWithCors } from "@/lib/embed/cors";
import { checkPublicApiLimit } from "@/lib/public-api-rate-limit";
import { VERSION_LABEL } from "@/lib/version";

const NO_STORE = { "Cache-Control": "no-store" };

/** OPTIONS preflight — gated on the union of all active clients' allowed origins. */
export async function OPTIONS(req: Request) {
  const limited = checkPublicApiLimit(req, "embed-config-options");
  if (limited) return limited;

  const origin = req.headers.get("Origin");
  if (!origin) {
    return new Response(null, { status: 204 });
  }

  let union = getCachedUnionOrigins();
  if (union === null) {
    const db = await getChatDb();
    union = await loadUnionAllowedOrigins(db);
    setCachedUnionOrigins(union);
  }

  if (!union.includes(origin)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: corsPreflightHeaders(origin, "GET, OPTIONS"),
  });
}

export async function GET(req: Request) {
  const limited = checkPublicApiLimit(req, "embed-config");
  if (limited) return limited;

  const requestOrigin = req.headers.get("Origin");
  const url = new URL(req.url);
  const embedToken = url.searchParams.get("embedToken");
  const parentOrigin = url.searchParams.get("parentOrigin");

  if (!embedToken) {
    return jsonWithCors({ error: "missing embedToken" }, 400, requestOrigin, NO_STORE);
  }

  const db = await getChatDb();
  const client = await resolveEmbedClient(db, embedToken);
  if (!client) {
    return jsonWithCors({ error: "embed not authorized" }, 403, requestOrigin, NO_STORE);
  }

  const verifiedOrigin = resolveVerifiedOrigin(req, parentOrigin);
  if (!isAllowedOrigin(client, verifiedOrigin)) {
    return jsonWithCors({ error: "parent origin not allowed" }, 403, requestOrigin, NO_STORE);
  }

  try {
    let version = await getSettingsVersion(db);
    const settings = await getSettings(db);
    if (!version) {
      version = (await getSettingsVersion(db)) ?? "default";
    }

    return jsonWithCors(
      toEmbedClientConfig(settings, version, VERSION_LABEL),
      200,
      requestOrigin,
      NO_STORE,
    );
  } catch {
    return jsonWithCors({ error: "config unavailable" }, 503, requestOrigin, NO_STORE);
  }
}
