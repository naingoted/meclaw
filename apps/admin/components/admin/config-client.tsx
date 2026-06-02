"use client";
import { Button, Input, Textarea, Label, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from "@meclaw/ui";
import * as React from "react";
import type { SettingsValue } from "@meclaw/core/settings";

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
      const res = await fetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(cfg) });
      setMsg(res.ok ? "Saved. Next message uses the new config." : "Invalid — fix the highlighted fields.");
    } catch {
      setMsg("Save failed — check your connection and retry.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-lg font-bold tracking-tight text-foreground">Config</h1>
      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">Agents &amp; Prompts</TabsTrigger>
          <TabsTrigger value="rag">RAG params</TabsTrigger>
          <TabsTrigger value="public">Public page</TabsTrigger>
        </TabsList>
        <TabsContent value="agents">
          {/* Iterates the extensible agents map — new agents appear automatically. */}
          <Label>Shared persona</Label>
          <Textarea value={cfg.shared.persona} onChange={(e) => set(["shared","persona"], e.target.value)} />
          {Object.keys(cfg.agents).map((key) => (
            <div key={key} className="mt-4 border-t pt-3">
              <div className="font-medium capitalize">{key}</div>
              <Label>Model</Label>
              <Input value={cfg.agents[key].model} onChange={(e) => set(["agents", key, "model"], e.target.value)} />
              <Label>Prompt</Label>
              <Textarea value={cfg.agents[key].prompt} onChange={(e) => set(["agents", key, "prompt"], e.target.value)} />
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cfg.agents[key].thinking} onChange={(e) => set(["agents", key, "thinking"], e.target.checked)} />
                thinking
              </label>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="rag">
          <Label>Top-K</Label><Input type="number" value={cfg.rag.topK} onChange={(e) => set(["rag","topK"], Number(e.target.value))} />
          <Label>Score threshold</Label><Input type="number" step="0.01" value={cfg.rag.scoreThreshold} onChange={(e) => set(["rag","scoreThreshold"], Number(e.target.value))} />
          <Label>Tiny-corpus threshold</Label><Input type="number" value={cfg.rag.tinyCorpusThreshold} onChange={(e) => set(["rag","tinyCorpusThreshold"], Number(e.target.value))} />
        </TabsContent>
        <TabsContent value="public">
          <Label>Greeting</Label><Input value={cfg.public.greeting} onChange={(e) => set(["public","greeting"], e.target.value)} />
          <Label>Cal.com URL</Label><Input value={cfg.public.calUrl} onChange={(e) => set(["public","calUrl"], e.target.value)} />
          <Label>GitHub URL</Label><Input value={cfg.public.githubUrl} onChange={(e) => set(["public","githubUrl"], e.target.value)} />
        </TabsContent>
      </Tabs>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} loading={saving}>Save</Button>
        <span className={`text-sm ${msg.startsWith("Saved") ? "text-success" : msg ? "text-destructive" : "text-muted-foreground"}`}>{msg}</span>
      </div>
    </div>
  );
}
