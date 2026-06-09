"use client";

import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  relativeTime,
  Skeleton,
  StatusPill,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
} from "@meclaw/ui";
import * as React from "react";
import type { RunDetail, RunSummary } from "@/lib/research/types";
import { useResearchRun } from "@/lib/research/use-research-run";
import { BriefingReportView } from "./briefing-report";
import { ResearchTrace } from "./research-trace";

type ResearchTarget = {
  company?: string;
  role?: string;
  jd?: string;
};

export function ResearchClient() {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [runsKey, setRunsKey] = React.useState(0);

  if (selectedId) {
    return (
      <RunDetailView
        id={selectedId}
        onBack={() => {
          setSelectedId(null);
          setRunsKey((current) => current + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Briefings" subtitle="Owner → role/company intelligence" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <NewBriefing onSettled={() => setRunsKey((current) => current + 1)} />
        <RunsList key={runsKey} onSelect={setSelectedId} />
      </div>
    </div>
  );
}

// fallow-ignore-next-line complexity
function NewBriefing({ onSettled }: { onSettled: () => void }) {
  const [company, setCompany] = React.useState("");
  const [role, setRole] = React.useState("");
  const [jd, setJd] = React.useState("");
  const [submittedTarget, setSubmittedTarget] = React.useState<ResearchTarget | null>(null);
  const run = useResearchRun();
  const prevPhase = React.useRef(run.phase);

  React.useEffect(() => {
    if (prevPhase.current === "running" && (run.phase === "done" || run.phase === "error")) {
      onSettled();
    }
    prevPhase.current = run.phase;
  }, [onSettled, run.phase]);

  const showReset =
    run.phase !== "idle" ||
    run.report !== null ||
    run.steps.length > 0 ||
    Boolean(run.error) ||
    submittedTarget !== null;
  const canSubmit = Boolean(company.trim() || role.trim() || jd.trim());
  const showTrace =
    run.phase === "running" ||
    ((run.steps.length > 0 || run.status === "error" || run.status === "degraded") &&
      run.report === null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || run.phase === "running") return;
    const payload = trimmedPayload({ company, role, jd });
    setSubmittedTarget(payload);
    await run.start(payload);
  }

  function onReset() {
    setCompany("");
    setRole("");
    setJd("");
    setSubmittedTarget(null);
    run.reset();
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Run a new briefing</h2>
        <p className="text-sm text-muted-foreground">
          Capture a target company, role, or job description and stream the research trace live.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <BriefingFormFields
          company={company}
          role={role}
          jd={jd}
          onCompanyChange={setCompany}
          onRoleChange={setRole}
          onJdChange={setJd}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={!canSubmit || run.phase === "running"}
            loading={run.phase === "running"}
          >
            Run briefing
          </Button>
          {showReset ? (
            <Button type="button" variant="ghost" onClick={onReset}>
              New briefing
            </Button>
          ) : null}
        </div>
      </form>

      {run.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {run.error}
        </p>
      ) : null}

      {showTrace ? (
        <ResearchTrace steps={run.steps} running={run.phase === "running"} status={run.status} />
      ) : null}

      {run.report && submittedTarget ? (
        <BriefingReportView
          report={run.report}
          status={run.status ?? "done"}
          target={submittedTarget}
        />
      ) : null}
    </section>
  );
}

function RunsList({ onSelect }: { onSelect: (id: string) => void }) {
  const [runs, setRuns] = React.useState<RunSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/admin/research");
        if (!response.ok) {
          throw new Error("Could not load briefings.");
        }
        const data = (await response.json()) as RunSummary[];
        if (active) {
          setRuns(data);
          setError(null);
        }
      } catch {
        if (active) {
          setRuns(null);
          setError("Could not load briefings.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Past briefings</h2>
        <p className="text-sm text-muted-foreground">
          Review previous runs and reopen the full report when you need the details.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : runs === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No briefings yet"
          hint="Run the first briefing to capture a streamed report and store it for later review."
        />
      ) : (
        <RunsTable runs={runs} onSelect={onSelect} />
      )}
    </section>
  );
}

function RunDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = React.useState<RunDetail | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch(`/api/admin/research/${id}`);
        if (response.status === 404) {
          if (active) {
            setMissing(true);
            setDetail(null);
          }
          return;
        }
        if (!response.ok) {
          throw new Error("Could not load briefing.");
        }
        const data = (await response.json()) as RunDetail;
        if (active) {
          setDetail(data);
          setMissing(false);
          setError(null);
        }
      } catch {
        if (active) {
          setError("Could not load briefing.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Briefing detail"
        subtitle={detail ? formatTarget(detail.run.input) : undefined}
        action={
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        }
      />

      <DetailContent detail={detail} missing={missing} error={error} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function BriefingFormFields({
  company,
  role,
  jd,
  onCompanyChange,
  onRoleChange,
  onJdChange,
}: {
  company: string;
  role: string;
  jd: string;
  onCompanyChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onJdChange: (value: string) => void;
}) {
  return (
    <>
      <Field label="Company">
        <Input
          name="company"
          value={company}
          onChange={(event) => onCompanyChange(event.target.value)}
          placeholder="Acme"
        />
      </Field>

      <Field label="Role">
        <Input
          name="role"
          value={role}
          onChange={(event) => onRoleChange(event.target.value)}
          placeholder="Staff backend engineer"
        />
      </Field>

      <Field label="Job description">
        <Textarea
          name="jd"
          value={jd}
          onChange={(event) => onJdChange(event.target.value)}
          placeholder="Paste the role brief or hiring notes."
        />
      </Field>
    </>
  );
}

function trimmedValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimmedPayload(target: ResearchTarget): ResearchTarget {
  return {
    company: trimmedValue(target.company ?? ""),
    role: trimmedValue(target.role ?? ""),
    jd: trimmedValue(target.jd ?? ""),
  };
}

function formatTarget(target: ResearchTarget) {
  const title = [target.company, target.role].filter(Boolean).join(" · ");
  if (title) return title;

  const jd = target.jd?.trim();
  if (!jd) return "Untitled briefing";

  return jd.length > 72 ? `${jd.slice(0, 69)}...` : jd;
}

function RunsTable({ runs, onSelect }: { runs: RunSummary[]; onSelect: (id: string) => void }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Target</TH>
          <TH>Fit</TH>
          <TH>Status</TH>
          <TH>When</TH>
        </TR>
      </THead>
      <TBody>
        {runs.map((run) => (
          <TR key={run.id}>
            <TD>
              <button
                type="button"
                className="cursor-pointer text-left text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelect(run.id)}
              >
                {formatTarget(run.input)}
              </button>
            </TD>
            <TD className="font-mono text-xs text-muted-foreground">
              {typeof run.fitScore === "number" ? run.fitScore.toFixed(2) : "—"}
            </TD>
            <TD>
              <StatusPill status={run.status} />
            </TD>
            <TD className="text-muted-foreground">{relativeTime(run.endedAt ?? run.startedAt)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function DetailContent({
  detail,
  missing,
  error,
}: {
  detail: RunDetail | null;
  missing: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (detail === null && !missing) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (missing) {
    return (
      <EmptyState
        title="Briefing not found"
        hint="This saved run may have been deleted or the ID is no longer valid."
      />
    );
  }

  if (detail && !detail.report) {
    return (
      <EmptyState
        title="No report for this briefing"
        hint="The run completed without a saved report payload."
      />
    );
  }

  if (detail?.report) {
    return (
      <BriefingReportView
        report={detail.report}
        status={detail.run.status}
        target={detail.run.input}
      />
    );
  }

  return null;
}
