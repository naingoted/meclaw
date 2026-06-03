import type { Db } from "../db/types";
import { getSettings, type SettingsValue } from "./settings";

/** The subset forwarded to the Python sidecar in the /chat request body. */
export async function configSnapshot(
  db: Db,
): Promise<Pick<SettingsValue, "agents" | "shared" | "rag" | "public">> {
  const s = await getSettings(db);
  return { agents: s.agents, shared: s.shared, rag: s.rag, public: s.public };
}
