"use client";
import { Button, Input, Textarea, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from "@meclaw/ui";
import * as React from "react";
import { useForm, Controller, type Path } from "react-hook-form";
import type { SettingsValue } from "@meclaw/core/settings";
import { Field } from "./field-label";

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

// Stack of fields with a consistent label→input and field→field rhythm.
const STACK = "space-y-5";

export function ConfigClient() {
  const [agentKeys, setAgentKeys] = React.useState<(keyof SettingsValue["agents"])[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<SettingsValue>();

  React.useEffect(() => {
    void (async () => {
      const data = (await (await fetch("/api/admin/settings")).json()) as SettingsValue;
      setAgentKeys(Object.keys(data.agents) as (keyof SettingsValue["agents"])[]);
      reset(data);
      setLoaded(true);
    })();
  }, [reset]);

  // Typed-path helpers: nested dynamic paths need a cast to satisfy RHF's Path type.
  const p = (path: string) => path as Path<SettingsValue>;

  async function onSubmit(values: SettingsValue) {
    try {
      // Strip blank suggestion lines before persisting.
      const payload = {
        ...values,
        public: { ...values.public, suggestions: values.public.suggestions.map((s) => s.trim()).filter(Boolean) },
      };
      const res = await fetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
      setMsg(res.ok ? "Saved. Chat updates within seconds." : "Invalid — fix the highlighted fields.");
    } catch {
      setMsg("Save failed — check your connection and retry.");
    }
  }

  if (!loaded) return (
    <div className="max-w-2xl space-y-3">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9" />
      <Skeleton className="h-40" />
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl">
      <h1 className="mb-4 text-lg font-bold tracking-tight text-foreground">Config</h1>
      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">Agents &amp; Prompts</TabsTrigger>
          <TabsTrigger value="rag">RAG params</TabsTrigger>
          <TabsTrigger value="public">Public page</TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          <div className={STACK}>
            <Field label="Shared persona" help={HELP.persona} htmlFor="shared.persona">
              <Textarea id="shared.persona" {...register("shared.persona")} />
            </Field>
            {agentKeys.map((key) => (
              <div key={key} className={`${STACK} border-t pt-5`}>
                <div className="font-medium capitalize">{key}</div>
                {MODEL_LABELS[key] ? (
                  <Field label={MODEL_LABELS[key]} help={HELP.model} htmlFor={`agents.${key}.model`}>
                    <Input id={`agents.${key}.model`} {...register(p(`agents.${key}.model`))} />
                  </Field>
                ) : null}
                <Field label="Prompt" help={HELP.prompt} htmlFor={`agents.${key}.prompt`}>
                  <Textarea id={`agents.${key}.prompt`} {...register(p(`agents.${key}.prompt`))} />
                </Field>
                {key === "triage" ? (
                  <Field label="Routing confidence" help={HELP.confidence} htmlFor="agents.triage.confidence">
                    <Input id="agents.triage.confidence" type="number" step="0.05" min="0" max="1" {...register("agents.triage.confidence", { valueAsNumber: true })} />
                  </Field>
                ) : null}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rag">
          <div className={STACK}>
            <Field label="Top-K" help={HELP.topK} htmlFor="rag.topK">
              <Input id="rag.topK" type="number" {...register("rag.topK", { valueAsNumber: true })} />
            </Field>
            <Field label="Score floor" help={HELP.scoreFloor} htmlFor="rag.scoreFloor">
              <Input id="rag.scoreFloor" type="number" step="0.01" {...register("rag.scoreFloor", { valueAsNumber: true })} />
            </Field>
            <Field label="Score threshold" help={HELP.scoreThreshold} htmlFor="rag.scoreThreshold">
              <Input id="rag.scoreThreshold" type="number" step="0.01" {...register("rag.scoreThreshold", { valueAsNumber: true })} />
            </Field>
            <Field label="Cluster radius" help={HELP.clusterRadius} htmlFor="rag.clusterRadius">
              <Input id="rag.clusterRadius" type="number" step="0.01" {...register("rag.clusterRadius", { valueAsNumber: true })} />
            </Field>
            <Field label="Tiny-corpus threshold" help={HELP.tinyCorpusThreshold} htmlFor="rag.tinyCorpusThreshold">
              <Input id="rag.tinyCorpusThreshold" type="number" {...register("rag.tinyCorpusThreshold", { valueAsNumber: true })} />
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="public">
          <div className={STACK}>
            <Field label="Greeting" help={HELP.greeting} htmlFor="public.greeting">
              <Input id="public.greeting" {...register("public.greeting")} />
            </Field>
            <Field label="Suggestions" help={HELP.suggestions} htmlFor="public.suggestions">
              <Controller
                control={control}
                name="public.suggestions"
                render={({ field }) => (
                  <Textarea
                    id="public.suggestions"
                    value={(field.value ?? []).join("\n")}
                    onChange={(e) => field.onChange(e.target.value.split("\n"))}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </Field>
            <Field label="Cal.com URL" help={HELP.calUrl} htmlFor="public.calUrl">
              <Input id="public.calUrl" {...register("public.calUrl")} />
            </Field>
            <Field label="GitHub URL" help={HELP.githubUrl} htmlFor="public.githubUrl">
              <Input id="public.githubUrl" {...register("public.githubUrl")} />
            </Field>
            <Field label="Contact email" help={HELP.contactEmail} htmlFor="public.contactEmail">
              <Input id="public.contactEmail" {...register("public.contactEmail")} />
            </Field>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" loading={isSubmitting}>Save</Button>
        <span className={`text-sm ${msg.startsWith("Saved") ? "text-success" : msg ? "text-destructive" : "text-muted-foreground"}`}>{msg}</span>
      </div>
    </form>
  );
}
