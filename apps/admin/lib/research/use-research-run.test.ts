import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  INITIAL_RESEARCH_STATE,
  type ResearchRequest,
  type ResearchRunState,
  reduceEvent,
  useResearchRun,
} from "./use-research-run";

const EMPTY_REPORT = {
  summary: "x",
  matched_strengths: [],
  gaps: [],
  talking_points: [],
  sources: [],
};

function chunk(text: string) {
  return new TextEncoder().encode(text);
}

function createScriptedReader(
  steps: Array<
    { kind: "chunk"; text: string } | { kind: "done" } | { kind: "error"; error: Error }
  >,
) {
  return {
    cancel: vi.fn(async () => {}),
    read: vi.fn(async () => {
      const step = steps.shift();
      if (!step || step.kind === "done") {
        return { done: true, value: undefined };
      }
      if (step.kind === "error") {
        throw step.error;
      }
      return { done: false, value: chunk(step.text) };
    }),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

function createControlledReader() {
  const pending: Array<{
    reject: (error: Error) => void;
    resolve: (result: ReadableStreamReadResult<Uint8Array>) => void;
  }> = [];

  return {
    reader: {
      cancel: vi.fn(async () => {}),
      read: vi.fn(
        () =>
          new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
            pending.push({ resolve, reject });
          }),
      ),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>,
    fail(error: Error) {
      const next = pending.shift();
      if (!next) throw new Error("No pending read to reject.");
      next.reject(error);
    },
    finish() {
      const next = pending.shift();
      if (!next) throw new Error("No pending read to finish.");
      next.resolve({ done: true, value: undefined });
    },
    push(text: string) {
      const next = pending.shift();
      if (!next) throw new Error("No pending read to resolve.");
      next.resolve({ done: false, value: chunk(text) });
    },
  };
}

function okResponse(reader: ReadableStreamDefaultReader<Uint8Array>) {
  return {
    body: { getReader: () => reader },
    ok: true,
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("reduceEvent", () => {
  it("appends status steps, de-duping a repeated label", () => {
    let state: ResearchRunState = { ...INITIAL_RESEARCH_STATE, phase: "running" };
    state = reduceEvent(state, { kind: "status", label: "Planning research", stage: "plan" });
    state = reduceEvent(state, { kind: "status", label: "Planning research", stage: "plan" });
    state = reduceEvent(state, { kind: "status", label: "Researching", stage: "research" });

    expect(state.steps).toEqual(["Planning research", "Researching"]);
  });

  it("captures the report + status; done finalizes the phase", () => {
    let state: ResearchRunState = { ...INITIAL_RESEARCH_STATE, phase: "running" };
    state = reduceEvent(state, { kind: "report", report: EMPTY_REPORT, status: "degraded" });

    expect(state.report?.summary).toBe("x");
    expect(state.status).toBe("degraded");
    expect(state.phase).toBe("running");

    state = reduceEvent(state, { kind: "done" });

    expect(state.phase).toBe("done");
  });

  it("an error report drives the phase to error on done", () => {
    let state: ResearchRunState = { ...INITIAL_RESEARCH_STATE, phase: "running" };
    state = reduceEvent(state, { kind: "report", report: null, status: "error" });
    state = reduceEvent(state, { kind: "done" });

    expect(state.phase).toBe("error");
  });
});

function createStreamingReport(status: string = "done") {
  return createScriptedReader([
    {
      kind: "chunk",
      text: [
        'data: {"type":"data-status","data":{"label":"Planning research","stage":"plan"}}',
        `data: {"type":"data-report","data":{"report":{"summary":"x","matched_strengths":[],"gaps":[],"talking_points":[],"sources":[]},"status":"${status}"}}`,
        "data: [DONE]",
      ].join("\n\n"),
    },
    { kind: "done" },
  ]);
}

async function startAndWait(
  hook: { result: { current: ReturnType<typeof useResearchRun> } },
  payload: ResearchRequest = { company: "Acme" },
) {
  await act(async () => {
    await hook.result.current.start(payload);
  });
}

describe("useResearchRun", () => {
  it("surfaces fetch failures as an error state", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useResearchRun());

    await startAndWait({ result }, { company: "Acme" });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBe("Could not reach the server.");
  });

  it("folds streamed events and flushes a final unterminated [DONE] frame", async () => {
    const reader = createStreamingReport("done");
    vi.mocked(fetch).mockResolvedValueOnce(okResponse(reader));
    const { result } = renderHook(() => useResearchRun());

    await startAndWait({ result });

    expect(result.current.steps).toEqual(["Planning research"]);
    expect(result.current.report?.summary).toBe("x");
    expect(result.current.status).toBe("done");
    expect(result.current.phase).toBe("done");
  });

  it("marks the run as failed when stream reading throws", async () => {
    const reader = createScriptedReader([{ kind: "error", error: new Error("boom") }]);
    vi.mocked(fetch).mockResolvedValueOnce(okResponse(reader));
    const { result } = renderHook(() => useResearchRun());

    await startAndWait({ result }, { role: "Backend" });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBe("Request failed.");
  });

  it("ignores stale events after reset cancels the active run", async () => {
    const active = createControlledReader();
    vi.mocked(fetch).mockResolvedValueOnce(okResponse(active.reader));
    const { result } = renderHook(() => useResearchRun());

    act(() => {
      void result.current.start({ company: "Acme" });
    });

    await waitFor(() => expect(active.reader.read).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.reset();
    });

    act(() => {
      active.push('data: {"type":"data-status","data":{"label":"Old run","stage":"plan"}}\n\n');
    });

    await waitFor(() => expect(active.reader.read).toHaveBeenCalledTimes(2));

    act(() => {
      active.finish();
    });

    expect(active.reader.cancel).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("idle");
    expect(result.current.steps).toEqual([]);
    expect(result.current.report).toBeNull();
  });

  it("finalizes to done on clean EOF after a report even without [DONE]", async () => {
    const reader = createStreamingReport("degraded");
    vi.mocked(fetch).mockResolvedValueOnce(okResponse(reader));
    const { result } = renderHook(() => useResearchRun());

    await startAndWait({ result }, { role: "Backend" });

    expect(result.current.status).toBe("degraded");
    expect(result.current.phase).toBe("done");
  });
});
