"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

type Doc = { id: string; title: string; body?: string; category?: string | null; status: string; updatedAt: string; lastIngestedAt: string | null };
const isDirty = (d: Doc) => !d.lastIngestedAt || new Date(d.updatedAt) > new Date(d.lastIngestedAt);

export function DocumentsClient() {
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [editing, setEditing] = React.useState<Doc | null>(null);
  const load = React.useCallback(async () => setDocs(await (await fetch("/api/admin/documents")).json()), []);
  React.useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function save(d: { id?: string; title: string; body: string; category?: string }) {
    const url = d.id ? `/api/admin/documents/${d.id}` : "/api/admin/documents";
    await fetch(url, { method: d.id ? "PUT" : "POST", body: JSON.stringify(d) });
    setEditing(null); await load();
  }
  async function remove(id: string) { await fetch(`/api/admin/documents/${id}`, { method: "DELETE" }); await load(); }
  async function ingest(id: string) { await fetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ documentId: id }) }); await load(); }

  if (editing) return <Editor doc={editing} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Documents</h1>
        <Button onClick={() => setEditing({ id: "", title: "", body: "", status: "draft", updatedAt: "", lastIngestedAt: null })}>New document</Button>
      </div>
      <Table><THead><TR><TH>Title</TH><TH>Status</TH><TH>Dirty</TH><TH></TH></TR></THead>
        <TBody>{docs.map((d) => (
          <TR key={d.id}>
            <TD><button className="underline" onClick={async () => setEditing(await (await fetch(`/api/admin/documents/${d.id}`)).json())}>{d.title}</button></TD>
            <TD><Badge tone={d.status}>{d.status}</Badge></TD>
            <TD>{isDirty(d) ? "●" : "—"}</TD>
            <TD className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => ingest(d.id)}>Ingest</Button>
              <Button size="sm" variant="destructive" onClick={() => remove(d.id)}>Delete</Button>
            </TD>
          </TR>
        ))}</TBody>
      </Table>
    </div>
  );
}

function Editor({ doc, onSave, onCancel }: { doc: Doc; onSave: (d: { id?: string; title: string; body: string; category?: string }) => void; onCancel: () => void }) {
  const [title, setTitle] = React.useState(doc.title);
  const [body, setBody] = React.useState(doc.body ?? "");
  const [category, setCategory] = React.useState(doc.category ?? "");
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{doc.id ? "Edit" : "New"} document</h1>
      <Input className="mb-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input className="mb-2" placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <Textarea className="mb-2 min-h-[50vh] font-mono" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <Button onClick={() => onSave({ id: doc.id || undefined, title, body, category: category || undefined })}>Save</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
