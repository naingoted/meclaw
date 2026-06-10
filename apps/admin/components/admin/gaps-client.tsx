"use client";
import {
  Button,
  EmptyState,
  Input,
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
import { toast } from "sonner";
import { useUrlState } from "@/lib/use-url-state";
import { AdminPage, useAdminFetch, useAdminMutation } from "./framework";

type ClusterSummary = {
  id: string;
  exemplarQuery: string | null;
  count: number;
  status: string;
  updatedAt: string;
  reasons: Record<string, number>;
};
type Miss = {
  id: string;
  query: string;
  reason: string;
  topScore: number | null;
  conversationId: string;
  createdAt: string;
};
type Detail = {
  cluster: { id: string; exemplarQuery: string | null; count: number; status: string };
  misses: Miss[];
};

const STATUSES = ["new", "resolved", "ignored"] as const;
const reasonSummary = (r: Record<string, number>) =>
  Object.entries(r)
    .map(([k, v]) => `${k}:${v}`)
    .join("  ") || "—";

export function GapsClient() {
  const [status, setStatus] = useUrlState("status", "new", STATUSES);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const {
    data: clusters,
    loading,
    refetch,
  } = useAdminFetch<ClusterSummary[]>(`/api/admin/gaps?status=${status}`);

  // When a mutation invalidates "gaps", refetch the list
  React.useEffect(() => {
    const handler = (e: Event) => {
      const { keys } = (e as CustomEvent).detail as { keys: string[] };
      if (keys.includes("gaps")) refetch();
    };
    window.addEventListener("admin-cache-invalidate", handler);
    return () => window.removeEventListener("admin-cache-invalidate", handler);
  }, [refetch]);

  if (selectedId) {
    return (
      <GapDetail
        id={selectedId}
        onBack={() => {
          setSelectedId(null);
          refetch();
        }}
      />
    );
  }

  return (
    <AdminPage
      title="Gaps"
      subtitle={
        clusters
          ? `${clusters.length} ${status} cluster${clusters.length === 1 ? "" : "s"}`
          : undefined
      }
      action={
        <a href="/api/admin/gaps/export" download>
          <Button variant="outline">Download CSV</Button>
        </a>
      }
    >
      <div className="mb-item flex gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === status ? "default" : "ghost"}
            aria-pressed={s === status}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : !clusters?.length ? (
        <EmptyState
          title="No gaps here"
          hint="Questions the corpus couldn't answer will cluster here as visitors ask them."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Question</TH>
              <TH>Hits</TH>
              <TH>Reasons</TH>
              <TH>Status</TH>
              <TH>Last seen</TH>
            </TR>
          </THead>
          <TBody>
            {clusters?.map((c) => (
              <TR key={c.id}>
                <TD>
                  <button
                    type="button"
                    className="cursor-pointer text-left text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setSelectedId(c.id)}
                  >
                    {c.exemplarQuery ?? "(no exemplar)"}
                  </button>
                </TD>
                <TD>{c.count}</TD>
                <TD className="font-mono text-xs text-muted-foreground">
                  {reasonSummary(c.reasons)}
                </TD>
                <TD>
                  <StatusPill status={c.status} />
                </TD>
                <TD className="text-muted-foreground">{relativeTime(c.updatedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </AdminPage>
  );
}

function GapDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: detail, loading } = useAdminFetch<Detail>(`/api/admin/gaps/${id}`);
  const [answering, setAnswering] = React.useState(false);

  const ignoreMutation = useAdminMutation(`/api/admin/gaps/${id}`, {
    method: "PATCH",
    successMessage: "Gap ignored",
    errorMessage: "Failed to ignore gap",
    invalidateKeys: ["gaps"],
    onSuccess: () => onBack(),
  });

  function ignore() {
    void ignoreMutation.mutate({ action: "ignore" });
  }

  async function answer(title: string, body: string) {
    const requestId = crypto.randomUUID();
    const res = await fetch(`/api/admin/gaps/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, title, body }),
    });
    if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
  }

  if (loading || !detail) return <Skeleton className="h-40" />;

  const isResolved = detail.cluster.status === "resolved";
  const answerLabel = isResolved ? "Update this gap" : "Answer this gap";

  if (answering) {
    return (
      <AnswerForm
        defaultTitle={detail.cluster.exemplarQuery ?? ""}
        onSubmit={answer}
        onCancel={() => setAnswering(false)}
      />
    );
  }

  return (
    <AdminPage
      title={detail.cluster.exemplarQuery ?? "Gap"}
      subtitle={`${detail.cluster.count} hits · ${detail.cluster.status}`}
      action={
        <div className="flex gap-item">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="ghost-danger"
            loading={ignoreMutation.isPending}
            onClick={ignore}
            aria-label="Ignore this gap"
          >
            Ignore
          </Button>
          <Button onClick={() => setAnswering(true)}>{answerLabel}</Button>
        </div>
      }
    >
      <Table>
        <THead>
          <TR>
            <TH>Question</TH>
            <TH>Reason</TH>
            <TH>Top score</TH>
            <TH>When</TH>
          </TR>
        </THead>
        <TBody>
          {detail.misses.map((m) => (
            <TR key={m.id}>
              <TD>{m.query}</TD>
              <TD>
                <StatusPill status={m.reason} />
              </TD>
              <TD className="font-mono text-xs">
                {m.topScore == null ? "—" : m.topScore.toFixed(2)}
              </TD>
              <TD className="text-muted-foreground">{relativeTime(m.createdAt)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </AdminPage>
  );
}

function AnswerForm({
  defaultTitle,
  onSubmit,
  onCancel,
}: {
  defaultTitle: string;
  onSubmit: (title: string, body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(defaultTitle);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(title, body);
      toast.success("Gap resolved — document created and ingest queued");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-lg font-bold tracking-tight text-foreground">Answer this gap</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Write a knowledge document that answers this question. Saving creates the document, queues
        ingest, and marks the gap resolved — all in a single transaction.
      </p>
      <Input
        className="mb-2"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-invalid={title.length === 0 && body.length > 0}
        aria-label="Document title"
        required
      />
      <Textarea
        className="mb-2 min-h-[40vh] font-sans"
        placeholder="Answer content (markdown)…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-invalid={body.length === 0 && title.length > 0}
        aria-label="Answer content"
        required
      />
      {error ? (
        <p className="mb-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-item">
        <Button loading={busy} disabled={!canSubmit} onClick={handleSubmit}>
          Save, ingest &amp; resolve
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
