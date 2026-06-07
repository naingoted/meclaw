"use client";
import {
  Button,
  deriveStatusCounts,
  EmptyState,
  relativeTime,
  Skeleton,
  StatTile,
  StatusPill,
} from "@meclaw/ui";
import * as React from "react";

type Job = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  chunksWritten: number | null;
  documentId: string | null;
  createdAt?: string | null;
};
type Stats = { documents: number; dirty: number; lastIngest: string | null };

export function JobsClient() {
  const [jobs, setJobs] = React.useState<Job[] | null>(null);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [retrying, setRetrying] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [j, s] = await Promise.all([
      fetch("/api/admin/jobs").then((r) => r.json()),
      fetch("/api/admin/stats").then((r) => r.json()),
    ]);
    setJobs(j as Job[]);
    setStats(s as Stats);
  }, []);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
    const t = setInterval(() => {
      void load();
    }, 2000);
    return () => clearInterval(t);
  }, [load]);

  async function reingestAll() {
    setBusy(true);
    try {
      await fetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ all: true }) });
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setRetrying(id);
    try {
      await fetch(`/api/admin/jobs/${id}/retry`, { method: "POST" });
      await load();
    } finally {
      setRetrying(null);
    }
  }

  const counts = deriveStatusCounts(jobs ?? [], stats?.dirty ?? 0);
  const dirty = stats?.dirty ?? 0;

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Ingestion</h1>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {stats?.lastIngest ? `last run ${relativeTime(stats.lastIngest)}` : "no runs yet"}
          </p>
        </div>
        <Button onClick={reingestAll} loading={busy} disabled={dirty === 0}>
          {dirty > 0 ? `Reingest ${dirty} dirty` : "All ingested"}
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatTile
          label="Dirty"
          value={counts.dirty}
          tone={counts.dirty > 0 ? "warning" : "neutral"}
        />
        <StatTile label="Queued" value={counts.queued} />
        <StatTile
          label="Running"
          value={counts.running}
          tone={counts.running > 0 ? "running" : "neutral"}
        />
        <StatTile
          label="Failed"
          value={counts.failed}
          tone={counts.failed > 0 ? "danger" : "neutral"}
        />
      </div>

      {jobs === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No ingest jobs yet"
          hint="Ingest a document, or reingest dirty docs to populate the log."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-[100px_1fr_70px_60px] gap-3 border-b border-border bg-card px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Status</span>
            <span>Document</span>
            <span>Chunks</span>
            <span></span>
          </div>
          {jobs.map((j) => (
            <div
              key={j.id}
              className="grid grid-cols-[100px_1fr_70px_60px] items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0"
            >
              <StatusPill status={j.status} />
              <div className="min-w-0">
                <div className="truncate text-foreground">{j.documentId ?? j.kind}</div>
                {j.status === "failed" && j.error ? (
                  <div className="mt-0.5 truncate text-xs text-destructive" title={j.error}>
                    {j.error}
                  </div>
                ) : null}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {j.chunksWritten ?? "—"}
              </span>
              <span className="text-right">
                {j.status === "failed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={retrying === j.id}
                    onClick={() => retry(j.id)}
                  >
                    Retry
                  </Button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
