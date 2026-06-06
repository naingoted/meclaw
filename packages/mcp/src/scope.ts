export const SCOPES = ["public", "operator"] as const;
export type Scope = (typeof SCOPES)[number];

/** Canonical tool names and which scopes expose them. Single source of truth. */
// fallow-ignore-next-line unused-export
export const TOOL_SCOPES: Record<string, Scope[]> = {
  search_corpus: ["public", "operator"],
  owner_contact: ["public", "operator"],
  schedule_call: ["public", "operator"],
  show_resume: ["public", "operator"],
  how_this_works: ["public", "operator"],
  describe_schema: ["operator"],
  run_read_query: ["operator"],
  get_telemetry: ["operator"],
};

export function toolsForScope(scope: Scope): string[] {
  return Object.entries(TOOL_SCOPES)
    .filter(([, scopes]) => scopes.includes(scope))
    .map(([name]) => name);
}
