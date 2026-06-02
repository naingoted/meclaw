"use client";
import { Button } from "@meclaw/ui";
import * as React from "react";

type Stats = { documents: number; dirty: number; lastIngest: string | null };
type Activity = { id: string; ts: string; action: string; entityType: string; entityId: string | null; summary: string; meta: unknown | null; actorIp: string | null };
type DashboardData = { stats: Stats; activity: Activity[] };

export function DashboardClient() {
  const [data, setData] = React.useState<DashboardData | null>(null);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/admin/stats");
    const json = (await response.json()) as DashboardData;
    setData(json);
  }, []);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!data) return <p>Loading…</p>;

  async function reingestAll() {
    await fetch("/api/admin/jobs", {
      method: "POST",
      body: JSON.stringify({ all: true }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Documents" value={data.stats.documents} />
        <Stat label="Dirty docs" value={data.stats.dirty} />
        <Stat
          label="Last ingest"
          value={
            data.stats.lastIngest ? new Date(data.stats.lastIngest).toLocaleString() : "—"
          }
        />
      </div>
      <Button onClick={reingestAll}>Reingest all dirty</Button>
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase text-muted-foreground">
        Recent activity
      </h2>
      <ul className="space-y-1 text-sm">
        {data.activity.map((a) => (
          <li key={a.id}>
            {new Date(a.ts).toLocaleTimeString()} — {a.summary}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
