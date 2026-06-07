"use client";
import { EmptyState, relativeTime, Skeleton, Table, TBody, TD, TH, THead, TR } from "@meclaw/ui";
import * as React from "react";

type AuditRow = { id: string; ts: string; action: string; summary: string };

export function AuditClient() {
  const [rows, setRows] = React.useState<AuditRow[] | null>(null);
  React.useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then(setRows);
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold tracking-tight text-foreground">Audit log</h1>
      {rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No audit entries yet"
          hint="Admin actions (saves, ingests, deletes) will appear here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Time</TH>
              <TH>Action</TH>
              <TH>Summary</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((a) => (
              <TR key={a.id}>
                <TD
                  className="font-mono text-xs text-muted-foreground"
                  title={new Date(a.ts).toLocaleString()}
                >
                  {relativeTime(a.ts)}
                </TD>
                <TD>{a.action}</TD>
                <TD>{a.summary}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
