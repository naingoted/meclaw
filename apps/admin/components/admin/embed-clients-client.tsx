"use client";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
} from "@meclaw/ui";
import { Ban, Check, Copy, Plus } from "lucide-react";
import * as React from "react";

type Client = {
  id: string;
  publicToken: string;
  name: string;
  allowedOrigins: string[];
  rateLimitPerMin: number | null;
  createdAt: string;
  revokedAt: string | null;
};

export function EmbedClientsClient({ initial }: { initial: Client[] }) {
  const [clients, setClients] = React.useState<Client[]>(initial);
  const [showCreate, setShowCreate] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [createdToken, setCreatedToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/embed-clients");
    if (res.ok) setClients((await res.json()) as Client[]);
  }

  async function handleCreate(form: { name: string; origins: string[]; rateLimit: number | null }) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/embed-clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          allowedOrigins: form.origins,
          rateLimitPerMin: form.rateLimit,
        }),
      });
      if (!res.ok) throw new Error(`create ${res.status}`);
      const created = (await res.json()) as Client & { createdAt: string };
      setCreatedToken(created.publicToken);
      setClients((prev) => [created, ...prev]);
      setShowCreate(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id: string, patch: Partial<Client>) {
    await fetch(`/api/admin/embed-clients/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await refresh();
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this client? Existing embeds using this token will stop working.")) return;
    await fetch(`/api/admin/embed-clients/${id}`, { method: "DELETE" });
    await refresh();
  }

  function copyToken() {
    if (!createdToken) return;
    void navigator.clipboard.writeText(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Embed clients"
        subtitle="Third-party sites allowed to frame the chat widget. The public token is shown once at creation."
        action={
          <Button size="sm" className="gap-2" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4" /> New client
          </Button>
        }
      />

      {createdToken ? (
        <div className="rounded-lg border border-primary bg-primary/5 p-4 text-sm">
          <p className="mb-2 font-medium">
            New client created. Copy this token now — it will not be shown again:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-border bg-background px-2 py-1 font-mono text-xs">
              {createdToken}
            </code>
            <Button size="sm" variant="outline" onClick={copyToken}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setCreatedToken(null);
              setCopied(false);
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {showCreate ? (
        <CreateForm busy={busy} onCancel={() => setShowCreate(false)} onSubmit={handleCreate} />
      ) : null}

      {clients.length === 0 ? (
        <EmptyState title="No embed clients yet" hint="Create one to start handing out tokens." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Token</TH>
              <TH>Allowed origins</TH>
              <TH>Rate limit</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {clients.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                onRevoke={handleRevoke}
                onUpdate={(patch) => handleUpdate(c.id, patch)}
              />
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function ClientRow({
  client,
  onRevoke,
  onUpdate,
}: {
  client: Client;
  onRevoke: (id: string) => void;
  onUpdate: (patch: Partial<Client>) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(client.allowedOrigins.join("\n"));
  const revoked = client.revokedAt !== null;

  function save() {
    const origins = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onUpdate({ allowedOrigins: origins });
    setEditing(false);
  }

  return (
    <TR>
      <TD>
        <span className="font-medium">{client.name}</span>
        {revoked ? (
          <span className="ml-2 rounded-sm bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-destructive">
            revoked
          </span>
        ) : null}
      </TD>
      <TD>
        <code className="font-mono text-xs text-muted-foreground">
          {client.publicToken.slice(0, 14)}…
        </code>
      </TD>
      <TD>
        {editing ? (
          <div className="space-y-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={"https://one.com\nhttps://two.com"}
              rows={Math.max(2, draft.split("\n").length)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(client.allowedOrigins.join("\n"));
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {client.allowedOrigins.length === 0 ? (
              <span className="text-xs text-muted-foreground">(none)</span>
            ) : (
              client.allowedOrigins.map((o) => (
                <span
                  key={o}
                  className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px]"
                >
                  {o}
                </span>
              ))
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={revoked}>
              Edit
            </Button>
          </div>
        )}
      </TD>
      <TD className="font-mono text-xs">{client.rateLimitPerMin ?? "default"}</TD>
      <TD>
        <Button
          size="sm"
          variant="ghost-danger"
          onClick={() => onRevoke(client.id)}
          disabled={revoked}
          aria-label={`Revoke ${client.name}`}
        >
          <Ban className="h-4 w-4" />
          {revoked ? "Revoked" : "Revoke"}
        </Button>
      </TD>
    </TR>
  );
}

function CreateForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (form: { name: string; origins: string[]; rateLimit: number | null }) => void;
}) {
  const [name, setName] = React.useState("");
  const [origins, setOrigins] = React.useState("");
  const [rateLimit, setRateLimit] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = origins
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({
      name: name.trim(),
      origins: parsed,
      rateLimit: rateLimit.trim() ? parseInt(rateLimit, 10) : null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-4">
      <div className="grid gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-name">
          Name
        </label>
        <Input
          id="ec-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme landing page"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-origins">
          Allowed origins (one per line — exact scheme + host + port)
        </label>
        <Textarea
          id="ec-origins"
          value={origins}
          onChange={(e) => setOrigins(e.target.value)}
          placeholder="https://acme.com"
          rows={3}
        />
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-rate">
          Rate limit override (per minute; blank = default)
        </label>
        <Input
          id="ec-rate"
          type="number"
          min={1}
          max={10000}
          value={rateLimit}
          onChange={(e) => setRateLimit(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : null} Create
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
