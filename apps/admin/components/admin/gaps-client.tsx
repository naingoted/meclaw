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
import { useUrlState } from "@/lib/use-url-state";

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
  const [clusters, setClusters] = React.useState<ClusterSummary[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setClusters(await (await fetch(`/api/admin/gaps?status=${status}`)).json());
  }, [status]);
  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (selectedId) {
    return (
      <GapDetail
        id={selectedId}
        onBack={() => {
          setSelectedId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
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
      />

      <div className="mb-4 flex gap-2">
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

      {clusters === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : clusters.length === 0 ? (
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
            {clusters.map((c) => (
              <TR key={c.id}>
                <TD>
                  <button
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
    </div>
  );
}

function GapDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [answering, setAnswering] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const d = await (await fetch(`/api/admin/gaps/${id}`)).json();
      setDetail(d);
    })();
  }, [id]);

  async function ignore() {
    setBusy(true);
    try {
      await fetch(`/api/admin/gaps/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "ignore" }),
      });
      onBack();
    } finally {
      setBusy(false);
    }
  }

  // Close the loop: create a new document from the owner's answer, enqueue ingest,
  // then mark the cluster resolved + linked. Ingest runs async (best-effort) — the
  // Documents page shows its status; resolving here records the curation decision.
  async function answer(title: string, body: string) {
    setBusy(true);
    try {
      const doc = await (
        await fetch("/api/admin/documents", {
          method: "POST",
          body: JSON.stringify({ title, body, origin: "gap" }),
        })
      ).json();
      if (!doc?.id) throw new Error("Document creation failed");
      await fetch("/api/admin/jobs", {
        method: "POST",
        body: JSON.stringify({ documentId: doc.id }),
      });
      await fetch(`/api/admin/gaps/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "resolve", documentId: doc.id }),
      });
      onBack();
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <Skeleton className="h-40" />;

  if (answering) {
    return (
      <AnswerForm
        defaultTitle={detail.cluster.exemplarQuery ?? ""}
        busy={busy}
        onSubmit={answer}
        onCancel={() => setAnswering(false)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={detail.cluster.exemplarQuery ?? "Gap"}
        subtitle={`${detail.cluster.count} hits · ${detail.cluster.status}`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
            <Button variant="ghost-danger" loading={busy} onClick={ignore}>
              Ignore
            </Button>
            <Button loading={busy} onClick={() => setAnswering(true)}>
              Answer this gap
            </Button>
          </div>
        }
      />
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
    </div>
  );
}

function AnswerForm({
  defaultTitle,
  busy,
  onSubmit,
  onCancel,
}: {
  defaultTitle: string;
  busy: boolean;
  onSubmit: (title: string, body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(defaultTitle);
  const [body, setBody] = React.useState("");
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-lg font-bold tracking-tight text-foreground">Answer this gap</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Write a knowledge document that answers this question. Saving creates the document, queues
        ingest, and marks the gap resolved.
      </p>
      <Input
        className="mb-2"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Textarea
        className="mb-2 min-h-[40vh] font-sans"
        placeholder="Answer content (markdown)…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          loading={busy}
          disabled={!title.trim() || !body.trim()}
          onClick={() => onSubmit(title, body)}
        >
          Save, ingest &amp; resolve
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
