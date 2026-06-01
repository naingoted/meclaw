"use client";
import * as React from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export function AuditClient() {
  const [rows, setRows] = React.useState<any[]>([]);
  React.useEffect(() => { fetch("/api/admin/audit").then((r) => r.json()).then(setRows); }, []);
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Audit log</h1>
      <Table><THead><TR><TH>Time</TH><TH>Action</TH><TH>Summary</TH></TR></THead>
        <TBody>{rows.map((a) => (
          <TR key={a.id}><TD>{new Date(a.ts).toLocaleString()}</TD><TD>{a.action}</TD><TD>{a.summary}</TD></TR>
        ))}</TBody>
      </Table>
    </div>
  );
}
