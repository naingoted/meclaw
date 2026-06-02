"use client";
import { Button, Input, Textarea, StatusPill, PageHeader, Skeleton, EmptyState, Spinner, Table, THead, TBody, TR, TH, TD } from "@meclaw/ui";
import { Trash2 } from "lucide-react";
import * as React from "react";

type Doc = { id: string; title: string; body?: string; category?: string | null; status: string; updatedAt: string; lastIngestedAt: string | null };
type Job = { id: string; status: string; error: string | null; documentId: string | null; createdAt?: string | null };
const isDirty = (d: Doc) => !d.lastIngestedAt || new Date(d.updatedAt) > new Date(d.lastIngestedAt);
const isActive = (j?: Job) => j?.status === "queued" || j?.status === "running";

export function DocumentsClient() {
  const [docs, setDocs] = React.useState<Doc[] | null>(null);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [editing, setEditing] = React.useState<Doc | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => setDocs(await (await fetch("/api/admin/documents")).json()), []);
  const loadJobs = React.useCallback(async () => setJobs(await (await fetch("/api/admin/jobs")).json()), []);
  React.useEffect(() => { void load(); void loadJobs(); }, [load, loadJobs]);

  // Latest job per document. listJobs returns ascending by createdAt, so the
  // last write for each documentId wins (= most recent).
  const jobByDoc = React.useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) if (j.documentId) m.set(j.documentId, j);
    return m;
  }, [jobs]);

  // Poll the jobs endpoint only while some visible doc has an active job.
  const anyActive = (docs ?? []).some((d) => isActive(jobByDoc.get(d.id)));
  React.useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => { void loadJobs(); }, 2000);
    return () => clearInterval(t);
  }, [anyActive, loadJobs]);

  // When the last active job finishes, refresh docs so Dirty/status update.
  const prevActive = React.useRef(false);
  React.useEffect(() => {
    if (prevActive.current && !anyActive) void load();
    prevActive.current = anyActive;
  }, [anyActive, load]);

  async function openEditor(id: string) {
    setOpeningId(id);
    try { setEditing(await (await fetch(`/api/admin/documents/${id}`)).json()); }
    finally { setOpeningId(null); }
  }

  async function save(d: { id?: string; title: string; body: string; category?: string }) {
    const url = d.id ? `/api/admin/documents/${d.id}` : "/api/admin/documents";
    await fetch(url, { method: d.id ? "PUT" : "POST", body: JSON.stringify(d) });
    setEditing(null); await load();
  }
  async function remove(id: string) {
    setBusyId(id);
    try { await fetch(`/api/admin/documents/${id}`, { method: "DELETE" }); await load(); }
    finally { setBusyId(null); setConfirmId(null); }
  }
  async function ingest(id: string) {
    setPendingId(id);
    try {
      await fetch("/api/admin/jobs", { method: "POST", body: JSON.stringify({ documentId: id }) });
      await loadJobs(); // surface the queued job → starts polling, keeps button disabled
    } finally { setPendingId(null); }
  }

  if (editing) return <Editor doc={editing} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={docs ? `${docs.length} total` : undefined}
        action={
          <Button onClick={() => setEditing({ id: "", title: "", body: "", status: "draft", updatedAt: "", lastIngestedAt: null })}>
            New document
          </Button>
        }
      />

      {docs === null ? (
        <div className="space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          hint="Add your first knowledge document — it feeds the bot's answers after ingest."
          action={<Button onClick={() => setEditing({ id: "", title: "", body: "", status: "draft", updatedAt: "", lastIngestedAt: null })}>New document</Button>}
        />
      ) : (
        <Table>
          <THead><TR><TH>Title</TH><TH>Status</TH><TH>Dirty</TH><TH>Ingest</TH><TH></TH></TR></THead>
          <TBody>
            {docs.map((d) => {
              const job = jobByDoc.get(d.id);
              const ingesting = pendingId === d.id || isActive(job);
              return (
                <TR key={d.id}>
                  <TD>
                    <button
                      className="inline-flex cursor-pointer items-center gap-2 rounded-sm text-left text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none active:text-primary"
                      aria-busy={openingId === d.id || undefined}
                      disabled={openingId === d.id}
                      onClick={() => openEditor(d.id)}
                    >
                      {openingId === d.id ? <Spinner className="h-3.5 w-3.5 border-current border-t-transparent" /> : null}
                      {d.title}
                    </button>
                  </TD>
                  <TD><StatusPill status={d.status} /></TD>
                  <TD>{isDirty(d) ? <span className="text-accent" title="needs ingest">●</span> : <span className="text-muted-foreground">—</span>}</TD>
                  <TD>
                    {job ? (
                      job.status === "failed" && job.error
                        ? <span title={job.error}><StatusPill status={job.status} /></span>
                        : <StatusPill status={job.status} />
                    ) : <span className="text-muted-foreground">—</span>}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" loading={ingesting} onClick={() => ingest(d.id)}>Ingest</Button>
                      {confirmId === d.id ? (
                        <>
                          <Button size="sm" variant="destructive" loading={busyId === d.id} onClick={() => remove(d.id)}>Confirm delete</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button size="icon" variant="ghost-danger" aria-label={`Delete ${d.title}`} onClick={() => setConfirmId(d.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function Editor({ doc, onSave, onCancel }: { doc: Doc; onSave: (d: { id?: string; title: string; body: string; category?: string }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = React.useState(doc.title);
  const [body, setBody] = React.useState(doc.body ?? "");
  const [category, setCategory] = React.useState(doc.category ?? "");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSave({ id: doc.id || undefined, title, body, category: category || undefined }); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-lg font-bold tracking-tight text-foreground">{doc.id ? "Edit" : "New"} document</h1>
      <Input className="mb-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input className="mb-2" placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <Textarea className="mb-2 min-h-[50vh] font-sans" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <Button onClick={handleSave} loading={saving}>Save</Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
