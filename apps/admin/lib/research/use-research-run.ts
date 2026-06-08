"use client";

import React from "react";

import { parseResearchFrame, type ResearchEvent } from "./sse";
import type { BriefingReport, RunStatus } from "./types";

export type RunPhase = "idle" | "running" | "done" | "error";

export type ResearchRunState = {
  phase: RunPhase;
  steps: string[];
  report: BriefingReport | null;
  status: RunStatus | null;
  error?: string;
};

export const INITIAL_RESEARCH_STATE: ResearchRunState = {
  phase: "idle",
  steps: [],
  report: null,
  status: null,
};

export function reduceEvent(state: ResearchRunState, event: ResearchEvent): ResearchRunState {
  switch (event.kind) {
    case "status": {
      const last = state.steps[state.steps.length - 1];
      const steps = last === event.label ? state.steps : [...state.steps, event.label];
      return { ...state, steps };
    }
    case "report":
      return { ...state, report: event.report, status: event.status };
    case "done":
      return { ...state, phase: state.status === "error" ? "error" : "done" };
    default:
      return state;
  }
}

export type ResearchRequest = {
  company?: string;
  role?: string;
  jd?: string;
};

async function requestResearch(
  payload: ResearchRequest,
  signal: AbortSignal,
): Promise<Response | null> {
  try {
    return await fetch("/api/admin/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch {
    return null;
  }
}

async function readErrorBody(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Request failed.";
}

function completePhase(setState: React.Dispatch<React.SetStateAction<ResearchRunState>>): void {
  setState((current) =>
    current.phase === "running"
      ? { ...current, phase: current.status === "error" ? "error" : "done" }
      : current,
  );
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  runId: number,
  runIdRef: React.RefObject<number>,
  readerRef: React.RefObject<ReadableStreamDefaultReader<Uint8Array> | null>,
  foldFrames: (runId: number, buffer: string, flushTail: boolean) => string,
  setState: React.Dispatch<React.SetStateAction<ResearchRunState>>,
): Promise<void> {
  const reader = body.getReader();
  readerRef.current = reader;
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        foldFrames(runId, buffer, true);
        if (runId === runIdRef.current) completePhase(setState);
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = foldFrames(runId, buffer, false);
    }
  } catch {
    if (runId === runIdRef.current) {
      setState((current) => ({ ...current, phase: "error", error: "Request failed." }));
    }
  } finally {
    if (readerRef.current === reader) readerRef.current = null;
  }
}

export function useResearchRun() {
  const [state, setState] = React.useState<ResearchRunState>(INITIAL_RESEARCH_STATE);
  const runIdRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const readerRef = React.useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const applyEvent = React.useCallback(
    (runId: number, event: ResearchEvent) => {
      if (runId !== runIdRef.current) return;
      setState((current) => reduceEvent(current, event));
    },
    [setState],
  );

  const stopActiveRun = React.useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    void readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
  }, []);

  const foldFrames = React.useCallback(
    (runId: number, buffer: string, flushTail: boolean) => {
      const frames = buffer.split("\n\n");
      const tail = frames.pop() ?? "";

      for (const frame of frames) {
        const event = parseResearchFrame(frame);
        if (event) applyEvent(runId, event);
      }

      if (flushTail && tail.trim().length > 0) {
        const event = parseResearchFrame(tail);
        if (event) applyEvent(runId, event);
        return "";
      }

      return tail;
    },
    [applyEvent],
  );

  const start = React.useCallback(
    async (request: ResearchRequest) => {
      stopActiveRun();
      const runId = runIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ ...INITIAL_RESEARCH_STATE, phase: "running" });

      const response = await requestResearch(request, controller.signal);
      if (!response) {
        if (!controller.signal.aborted && runId === runIdRef.current) {
          setState((current) => ({
            ...current,
            phase: "error",
            error: "Could not reach the server.",
          }));
        }
        return;
      }

      if (runId !== runIdRef.current || !response.ok || !response.body) {
        if (runId === runIdRef.current && (!response.ok || !response.body)) {
          const message = await readErrorBody(response);
          setState((current) => ({ ...current, phase: "error", error: message }));
        }
        return;
      }

      await consumeStream(response.body, runId, runIdRef, readerRef, foldFrames, setState);

      if (abortRef.current === controller) abortRef.current = null;
    },
    [foldFrames, stopActiveRun],
  );

  React.useEffect(() => () => stopActiveRun(), [stopActiveRun]);

  const reset = React.useCallback(() => {
    stopActiveRun();
    setState(INITIAL_RESEARCH_STATE);
  }, [stopActiveRun]);

  return { ...state, start, reset };
}
