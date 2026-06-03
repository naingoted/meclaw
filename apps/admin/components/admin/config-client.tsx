"use client";
import { Button, Input, Textarea, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider } from "@meclaw/ui";
import * as React from "react";
import type { SettingsValue } from "@meclaw/core/settings";
import { FieldLabel } from "./field-label";

// Only two real models exist; scheduler/contact reuse the draft model, so only
// these two agents expose an editable model field.
const MODEL_LABELS: Record<string, string> = { triage: "Router model", knowledge: "Answer model" };

const HELP = {
  persona: "Prepended to every agent's system prompt. Sets the overall voice.",
  prompt: "System prompt for this agent's intent.",
  model: "Model id used for this agent.",
  confidence: "Triage answers only when its confidence is at least this (0–1). Below it, the bot asks a clarifying question.",
  topK: "How many chunks retrieval pulls from the corpus.",
  scoreFloor: "A retrieval is 'grounded' only if the top chunk's cosine score is at least this. Below it the answer is treated as a miss.",
  clusterRadius: "Max cosine distance for a miss to fold into an existing gap cluster.",
  scoreThreshold: "Per-chunk include filter: chunks scoring below this are dropped before building context (distinct from Score floor).",
  tinyCorpusThreshold: "If the whole corpus is smaller than this many tokens, skip retrieval and use the full corpus.",
  greeting: "First message shown on the public chat page.",
  suggestions: "Starter prompt chips on the public page. One per line.",
  calUrl: "Cal.com booking link used by the scheduler tool and the 'Book a call' button.",
  githubUrl: "GitHub profile link shown in the footer and the contact tool.",
  contactEmail: "Owner email returned by the contact tool.",
};

export function ConfigClient() {
  const [cfg, setCfg] = React.useState<SettingsValue | null>(null);
  const [msg, setMsg] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    void (async () => { setCfg(await (await fetch("/api/admin/settings")).json()); })();
  }, []);
  if (!cfg) return (
    <div className="max-w-2xl space-y-3">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9" />
      <Skeleton className="h-40" />
    </div>
  );
  const set = (path: string[], v: unknown): void =>
    setCfg((c) => {
      if (!c) return c;
      const n = structuredClone(c);
      let o: Record<string, unknown> = n as unknown as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]] as Record<string, unknown>;
      o[path[path.length - 1]] = v;
      return n;
    });
  async function save() {
    setSaving(true);
    try {
      // Strip blank suggestion lines before persisting.
      const payload = cfg
        ? { ...cfg, public: { ...cfg.public, suggestions: cfg.public.suggestions.map((s) => s.trim()).filter(Boolean) } }
        : cfg;
      const res = await fetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
      setMsg(res.ok ? "Saved. Live within ~30 min." : "Invalid — fix the highlighted fields.");
    } catch {
      setMsg("Save failed — check your connection and retry.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <TooltipProvider>
      <div className="max-w-2xl">
        <h1 className="mb-4 text-lg font-bold tracking-tight text-foreground">Config</h1>
        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents">Agents &amp; Prompts</TabsTrigger>
            <TabsTrigger value="rag">RAG params</TabsTrigger>
            <TabsTrigger value="public">Public page</TabsTrigger>
          </TabsList>
          <TabsContent value="agents">
            <FieldLabel label="Shared persona" help={HELP.persona} />
            <Textarea value={cfg.shared.persona} onChange={(e) => set(["shared","persona"], e.target.value)} />
            {(Object.keys(cfg.agents) as (keyof typeof cfg.agents)[]).map((key) => (
              <div key={key} className="mt-4 border-t pt-3">
                <div className="font-medium capitalize">{key}</div>
                {MODEL_LABELS[key] ? (
                  <>
                    <FieldLabel label={MODEL_LABELS[key]} help={HELP.model} />
                    <Input value={cfg.agents[key].model} onChange={(e) => set(["agents", key, "model"], e.target.value)} />
                  </>
                ) : null}
                <FieldLabel label="Prompt" help={HELP.prompt} />
                <Textarea value={cfg.agents[key].prompt} onChange={(e) => set(["agents", key, "prompt"], e.target.value)} />
                {key === "triage" ? (
                  <>
                    <FieldLabel label="Routing confidence" help={HELP.confidence} />
                    <Input type="number" step="0.05" min="0" max="1" value={cfg.agents.triage.confidence ?? 0.5} onChange={(e) => set(["agents","triage","confidence"], Number(e.target.value))} />
                  </>
                ) : null}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="rag">
            <FieldLabel label="Top-K" help={HELP.topK} />
            <Input type="number" value={cfg.rag.topK} onChange={(e) => set(["rag","topK"], Number(e.target.value))} />
            <FieldLabel label="Score floor" help={HELP.scoreFloor} />
            <Input type="number" step="0.01" value={cfg.rag.scoreFloor} onChange={(e) => set(["rag","scoreFloor"], Number(e.target.value))} />
            <FieldLabel label="Score threshold" help={HELP.scoreThreshold} />
            <Input type="number" step="0.01" value={cfg.rag.scoreThreshold} onChange={(e) => set(["rag","scoreThreshold"], Number(e.target.value))} />
            <FieldLabel label="Cluster radius" help={HELP.clusterRadius} />
            <Input type="number" step="0.01" value={cfg.rag.clusterRadius} onChange={(e) => set(["rag","clusterRadius"], Number(e.target.value))} />
            <FieldLabel label="Tiny-corpus threshold" help={HELP.tinyCorpusThreshold} />
            <Input type="number" value={cfg.rag.tinyCorpusThreshold} onChange={(e) => set(["rag","tinyCorpusThreshold"], Number(e.target.value))} />
          </TabsContent>
          <TabsContent value="public">
            <FieldLabel label="Greeting" help={HELP.greeting} />
            <Input value={cfg.public.greeting} onChange={(e) => set(["public","greeting"], e.target.value)} />
            <FieldLabel label="Suggestions" help={HELP.suggestions} />
            <Textarea value={cfg.public.suggestions.join("\n")} onChange={(e) => set(["public","suggestions"], e.target.value.split("\n"))} />
            <FieldLabel label="Cal.com URL" help={HELP.calUrl} />
            <Input value={cfg.public.calUrl} onChange={(e) => set(["public","calUrl"], e.target.value)} />
            <FieldLabel label="GitHub URL" help={HELP.githubUrl} />
            <Input value={cfg.public.githubUrl} onChange={(e) => set(["public","githubUrl"], e.target.value)} />
            <FieldLabel label="Contact email" help={HELP.contactEmail} />
            <Input value={cfg.public.contactEmail} onChange={(e) => set(["public","contactEmail"], e.target.value)} />
          </TabsContent>
        </Tabs>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} loading={saving}>Save</Button>
          <span className={`text-sm ${msg.startsWith("Saved") ? "text-success" : msg ? "text-destructive" : "text-muted-foreground"}`}>{msg}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
