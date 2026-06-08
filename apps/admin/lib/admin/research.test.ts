import { agentRuns, agentSteps } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { describe, expect, it } from "vitest";
import { getRun, listRuns } from "./research";

const RUN_ID = "11111111-1111-1111-1111-111111111111";

async function seed(db: Awaited<ReturnType<typeof makeTestDb>>["db"]) {
  await db.insert(agentRuns).values({
    id: RUN_ID,
    useCase: "briefing",
    input: { company: "Acme", role: "Backend" },
    status: "done",
    report: {
      summary: "Strong fit.",
      fit_score: 0.82,
      matched_strengths: [],
      gaps: [],
      talking_points: [],
      sources: [],
    },
    subtasks: 2,
    retries: 1,
    toolCalls: 4,
    tokens: 0,
    startedAt: new Date("2026-06-01T00:00:00Z"),
    endedAt: new Date("2026-06-01T00:01:00Z"),
  });
  await db.insert(agentSteps).values({
    id: "22222222-2222-2222-2222-222222222222",
    runId: RUN_ID,
    seq: 1,
    role: "researcher",
    input: { query: "q" },
    output: { text: "n" },
    createdAt: new Date("2026-06-01T00:00:30Z"),
  });
}

describe("research data layer", () => {
  it("listRuns returns summaries with fitScore lifted from the report", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const runs = await listRuns(db);
    expect(runs).toHaveLength(1);
    expect(runs[0].input.company).toBe("Acme");
    expect(runs[0].fitScore).toBe(0.82);
    expect(runs[0].status).toBe("done");
  });

  it("getRun returns the report + ordered steps, null when missing", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const detail = await getRun(db, RUN_ID);
    expect(detail?.report?.summary).toBe("Strong fit.");
    expect(detail?.steps[0].role).toBe("researcher");
    expect(await getRun(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
