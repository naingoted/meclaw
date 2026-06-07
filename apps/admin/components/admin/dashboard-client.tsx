"use client";
import { Button, PageHeader, relativeTime, Skeleton, StatTile } from "@meclaw/ui";
import * as React from "react";

type Stats = { documents: number; dirty: number; lastIngest: string | null };
type Activity = {
  id: string;
  ts: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  meta: unknown | null;
  actorIp: string | null;
};
type DashboardData = { stats: Stats; activity: Activity[] };

export function DashboardClient() {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [reingesting, setReingesting] = React.useState(false);

  const load = React.useCallback(async () => {
    const json = (await (await fetch("/api/admin/stats")).json()) as DashboardData;
    setData(json);
  }, []);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function reingestAll() {
    setReingesting(true);
    try {
      await fetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ all: true }) });
      await load();
    } finally {
      setReingesting(false);
    }
  }

  const dirty = data?.stats.dirty ?? 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={data ? `${data.stats.documents} documents` : undefined}
        action={
          <Button onClick={reingestAll} loading={reingesting} disabled={!data || dirty === 0}>
            {dirty > 0 ? `Reingest ${dirty} dirty` : "All ingested"}
          </Button>
        }
      />

      {!data ? (
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Documents" value={data.stats.documents} />
            <StatTile
              label="Dirty docs"
              value={data.stats.dirty}
              tone={data.stats.dirty > 0 ? "warning" : "neutral"}
            />
            <StatTile
              label="Last ingest"
              value={data.stats.lastIngest ? relativeTime(data.stats.lastIngest) : "—"}
            />
          </div>

          <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </h2>
          {data.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-card text-sm">
              {data.activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-foreground">{a.summary}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {relativeTime(a.ts)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
