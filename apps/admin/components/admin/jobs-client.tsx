"use client";
import { Button, Badge, Table, THead, TBody, TR, TH, TD } from "@meclaw/ui";
import * as React from "react";

type Job = { id: string; kind: string; status: string; error: string | null; chunksWritten: number | null; documentId: string | null };

export function JobsClient() {
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const load = React.useCallback(async () => setJobs(await (await fetch("/api/admin/jobs")).json()), []);
  React.useEffect(() => {
    void (async () => { await load(); })();
    const t = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(t);
  }, [load]);
  async function reingestAll() { await fetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ all: true }) }); await load(); }
  async function retry(id: string) { await fetch(`/api/admin/jobs/${id}/retry`, { method: "POST" }); await load(); }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ingestion &amp; Jobs</h1>
        <Button onClick={reingestAll}>Reingest all dirty</Button>
      </div>
      <Table><THead><TR><TH>Kind</TH><TH>Status</TH><TH>Chunks</TH><TH>Error</TH><TH></TH></TR></THead>
        <TBody>{jobs.map((j) => (
          <TR key={j.id}>
            <TD>{j.kind}</TD><TD><Badge tone={j.status}>{j.status}</Badge></TD>
            <TD>{j.chunksWritten ?? "—"}</TD><TD className="max-w-xs truncate text-red-700">{j.error ?? ""}</TD>
            <TD>{j.status === "failed" && <Button size="sm" variant="outline" onClick={() => retry(j.id)}>Retry</Button>}</TD>
          </TR>
        ))}</TBody>
      </Table>
    </div>
  );
}
