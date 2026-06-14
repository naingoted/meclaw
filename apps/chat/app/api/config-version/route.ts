import { initDb } from "@meclaw/core/db";
import { getSettings, getSettingsVersion } from "@meclaw/core/settings";
import { checkPublicApiLimit } from "@/lib/public-api-rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const limited = checkPublicApiLimit(req, "config-version");
  if (limited) return limited;

  try {
    const database = await initDb();
    let version = await getSettingsVersion(database);

    if (!version) {
      await getSettings(database);
      version = await getSettingsVersion(database);
    }

    if (!version) {
      return Response.json(
        { error: "config version unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }

    return Response.json({ version }, { headers: NO_STORE });
  } catch {
    return Response.json(
      { error: "config version unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
