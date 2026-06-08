import { agentRuns, agentSteps } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";
import { asc, desc, eq } from "drizzle-orm";
import type { BriefingReport, RunDetail, RunStatus, RunSummary } from "@/lib/research/types";

function toSummary(r: typeof agentRuns.$inferSelect): RunSummary {
  const report = (r.report ?? null) as BriefingReport | null;
  return {
    id: r.id,
    useCase: r.useCase,
    input: (r.input ?? {}) as RunSummary["input"],
    status: r.status as RunStatus,
    fitScore: typeof report?.fit_score === "number" ? report.fit_score : null,
    subtasks: r.subtasks,
    retries: r.retries,
    toolCalls: r.toolCalls,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
  };
}

export async function listRuns(db: Db, limit = 50): Promise<RunSummary[]> {
  const rows = await db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)).limit(limit);
  return rows.map(toSummary);
}

export async function getRun(db: Db, id: string): Promise<RunDetail | null> {
  const rows = await db.select().from(agentRuns).where(eq(agentRuns.id, id));
  const run = rows[0];
  if (!run) return null;
  const steps = await db
    .select()
    .from(agentSteps)
    .where(eq(agentSteps.runId, id))
    .orderBy(asc(agentSteps.seq));
  return {
    run: toSummary(run),
    report: (run.report ?? null) as BriefingReport | null,
    steps: steps.map((s) => ({
      seq: s.seq,
      role: s.role,
      verdict: s.validationVerdict,
      score: s.score,
      retryIndex: s.retryIndex,
      input: s.input,
      output: s.output,
    })),
  };
}
