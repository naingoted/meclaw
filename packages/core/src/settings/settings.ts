import { eq } from "drizzle-orm";
import { z } from "zod";
import { settings } from "../db/schema";
import type { Db } from "../db/types";
import { logAudit } from "./audit";
import { configCache } from "./config-cache";

export const AgentConfigSchema = z.object({
  model: z.string().min(1),
  thinking: z.boolean(),
  prompt: z.string(),
  /** Triage only: route-to-answer confidence gate (0–1). Other agents omit it. */
  confidence: z.number().min(0).max(1).optional(),
  framework: z.string().optional(),       // reserved seam: CrewAI/AutoGen/BeeAI
  tools: z.array(z.string()).optional(),  // reserved seam: tools / MCP refs
});

export const SettingsSchema = z.object({
  // Extensible agent map: any agent key is accepted, so adding agents/frameworks
  // is data, not a schema change. v1 seeds: triage, knowledge, scheduler, contact.
  agents: z.record(z.string(), AgentConfigSchema),
  shared: z.object({ persona: z.string() }),
  rag: z.object({
    topK: z.number().int().min(1).max(20),
    scoreThreshold: z.number().min(0).max(1),
    tinyCorpusThreshold: z.number().int().min(0),
    /** Relevance floor: retrieval is grounded iff top cosine score >= this. */
    scoreFloor: z.number().min(0).max(1).default(0.35),
    /** Max cosine distance for a miss to fold into an existing gap cluster. */
    clusterRadius: z.number().min(0).max(2).default(0.15),
    retriever: z.string().optional(),     // reserved seam: Advanced RAG; default 'vector'
  }),
  public: z.object({
    greeting: z.string(),
    suggestions: z.array(z.string()),
    calUrl: z.string(),
    githubUrl: z.string(),
    /** Default backfills legacy rows; seeds from the former hardcoded OWNER_EMAIL. */
    contactEmail: z.string().default("naingoted@gmail.com"),
  }),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type SettingsValue = z.infer<typeof SettingsSchema>;

/** Seeded from current env defaults so behavior is unchanged until first edit. */
export function defaultSettings(): SettingsValue {
  const triage = process.env.TRIAGE_MODEL ?? "glm-4.7";
  const draft = process.env.DRAFT_MODEL ?? "qwen3.6-plus";
  return {
    agents: {
      triage:    { model: triage, thinking: false, confidence: 0.5, prompt: "You are a triage router for a chatbot answering questions about Thet." },
      knowledge: { model: draft,  thinking: false, prompt: "You answer in a warm third-person voice about Thet, grounded in the provided context." },
      scheduler: { model: draft,  thinking: false, prompt: "The visitor wants to schedule a call with Thet. Use the booking link in the context." },
      contact:   { model: draft,  thinking: false, prompt: "The visitor wants Thet's contact details. Use the contact info in the context." },
    },
    shared: { persona: "" },
    rag: { topK: Number(process.env.RAG_TOP_K ?? 4), scoreThreshold: 0, tinyCorpusThreshold: 8000, scoreFloor: 0.35, clusterRadius: 0.15 },
    public: {
      greeting: "Hi! I'm meclaw, Thet's personal bot.",
      suggestions: ["What's Thet's tech stack?", "Walk me through a recent project", "How do I get in touch?"],
      calUrl: process.env.NEXT_PUBLIC_CAL_URL ?? "",
      githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
      contactEmail: "naingoted@gmail.com",
    },
  };
}

export async function getSettings(db: Db): Promise<SettingsValue> {
  const cached = configCache.get();
  if (cached) return cached;
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  let value: SettingsValue;
  if (rows[0]) {
    value = SettingsSchema.parse({ agents: rows[0].agents, shared: rows[0].shared, rag: rows[0].rag, public: rows[0].public });
  } else {
    value = defaultSettings();
    await db.insert(settings).values({ id: 1, ...value, updatedAt: new Date() }).execute();
  }
  configCache.set(value);
  return value;
}

export async function updateSettings(db: Db, next: SettingsValue, actorIp: string): Promise<SettingsValue> {
  const parsed = SettingsSchema.parse(next);
  const before = await getSettings(db);
  await db.insert(settings)
    .values({ id: 1, ...parsed, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.id, set: { ...parsed, updatedAt: new Date() } })
    .execute();
  await logAudit(db, { action: "config.update", entityType: "settings", entityId: "1", summary: "updated config", meta: { before, after: parsed }, actorIp });
  configCache.clear();
  return parsed;
}
