// Mirrors the C-1 pydantic BriefingReport (services/ai/app/research/schemas.py)
// and the agent_runs/agent_steps read shapes.

export type SourceKind = "corpus" | "db" | "web";
export type SourceRef = { kind: SourceKind; ref: string; title?: string };
export type MatchedStrength = { point: string; evidence: string; sources: SourceRef[] };
export type GapPoint = { point: string; note: string };

export type BriefingReport = {
  summary: string;
  fit_score?: number | null;
  matched_strengths: MatchedStrength[];
  gaps: GapPoint[];
  talking_points: string[];
  sources: SourceRef[];
};

export type RunStatus = "running" | "done" | "degraded" | "error";

export type RunSummary = {
  id: string;
  useCase: string;
  input: { company?: string; role?: string; jd?: string };
  status: RunStatus;
  fitScore: number | null;
  subtasks: number;
  retries: number;
  toolCalls: number;
  startedAt: string;
  endedAt: string | null;
};

export type RunStep = {
  seq: number;
  role: string;
  verdict: string | null;
  score: number | null;
  retryIndex: number | null;
  input: unknown;
  output: unknown;
};

export type RunDetail = { run: RunSummary; report: BriefingReport | null; steps: RunStep[] };
