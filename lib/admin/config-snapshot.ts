import { getSettings } from "./settings";

/** The subset forwarded to the Python sidecar in the /chat request body. */
export async function configSnapshot(db: any) {
  const s = await getSettings(db);
  return { agents: s.agents, shared: s.shared, rag: s.rag };
}
