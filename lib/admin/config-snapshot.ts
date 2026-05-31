import type { Db } from "@/lib/db/types";
import { getSettings } from "./settings";

/** The subset forwarded to the Python sidecar in the /chat request body. */
export async function configSnapshot(db: Db) {
  const s = await getSettings(db);
  return { agents: s.agents, shared: s.shared, rag: s.rag };
}
