import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { settings } from "../db/schema";
import type { Db } from "../db/types";
import { logAudit } from "./audit";
import { configCache } from "./config-cache";
import { DEFAULT_PUBLIC_COPY } from "./public-copy";

export const AgentConfigSchema = z.object({
  model: z.string().min(1),
  thinking: z.boolean(),
  prompt: z.string(),
  /** Triage only: route-to-answer confidence gate (0–1). Other agents omit it. */
  confidence: z.number().min(0).max(1).optional(),
  framework: z.string().optional(), // reserved seam: CrewAI/AutoGen/BeeAI
  tools: z.array(z.string()).optional(), // reserved seam: tools / MCP refs
});

export const SettingsSchema = z.object({
  // Extensible agent map: any agent key is accepted, so adding agents/frameworks
  // is data, not a schema change. v1 seeds: triage, knowledge, scheduler, contact.
  agents: z.record(z.string(), AgentConfigSchema),
  shared: z.object({ persona: z.string() }),
  rag: z.object({
    topK: z.number().int().min(1).max(20),
    scoreThreshold: z.number().min(0).max(1),
    /** Max cosine DISTANCE for the resolved-gap fast path to return a curated answer verbatim. */
    gapMatchThreshold: z.number().min(0).max(2).default(0.15),
    /** Relevance floor: retrieval is grounded iff top cosine score >= this. */
    scoreFloor: z.number().min(0).max(1).default(0.35),
    /** Max cosine distance for a miss to fold into an existing gap cluster. */
    clusterRadius: z.number().min(0).max(2).default(0.15),
    retriever: z.string().optional(), // reserved seam: Advanced RAG; default 'vector'
  }),
  public: z.object({
    greeting: z.string(),
    suggestions: z.array(z.string()),
    calUrl: z.string(),
    githubUrl: z.string(),
    /** Default backfills legacy rows; seeds from the former hardcoded OWNER_EMAIL. */
    contactEmail: z.string().default("naingoted@gmail.com"),
    /** Branding (D5): product name shown in the header + metadata. */
    botName: z.string().default("meclaw"),
    botTagline: z.string().default(""),
    brandLogoUrl: z
      .string()
      .default("")
      .refine((v) => v === "" || /^https?:\/\/[^\s"'<>]+$/.test(v), {
        message: "must be empty or http(s) URL",
      }),
    brandAccent: z
      .string()
      .default("")
      .refine((v) => v === "" || /^#[0-9a-fA-F]{3,8}$/.test(v), {
        message: "must be empty or hex color (#rgb, #rgba, #rrggbbaa)",
      }),
    copy: z
      .object({
        emptyStateIntro: z.string().default(DEFAULT_PUBLIC_COPY.emptyStateIntro),
        suggestionsLabel: z.string().default("Try asking:"),
        messagePlaceholder: z.string().default("Say something…"),
        thinkingLabel: z.string().default("Thinking…"),
        footerPrefix: z.string().default("Built this myself"),
        resumeLabel: z.string().default("Résumé"),
        bookCallLabel: z.string().default("Book a call"),
        bookShortLabel: z.string().default("Book"),
        githubLabel: z.string().default("GitHub"),
      })
      .default(DEFAULT_PUBLIC_COPY),
  }),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type SettingsValue = z.infer<typeof SettingsSchema>;

/** Seeded from current env defaults so behavior is unchanged until first edit. */
export function defaultSettings(): SettingsValue {
  const triage = process.env.TRIAGE_MODEL ?? "glm-4.7";
  const draft = process.env.DRAFT_MODEL ?? "qwen3.6-plus";
  const owner = process.env.BOT_OWNER_NAME ?? "Thet";
  const botName = process.env.BOT_NAME ?? "meclaw";
  const raw = {
    agents: {
      triage: {
        model: triage,
        thinking: false,
        confidence: 0.5,
        prompt: `You are a triage router for a chatbot answering questions about ${owner}.`,
      },
      knowledge: {
        model: draft,
        thinking: false,
        prompt: `You answer in a warm third-person voice about ${owner}, grounded in the provided context.`,
      },
      scheduler: {
        model: draft,
        thinking: false,
        prompt: `The visitor wants to schedule a call with ${owner}. Use the booking link in the context.`,
      },
      contact: {
        model: draft,
        thinking: false,
        prompt: `The visitor wants ${owner}'s contact details. Use the contact info in the context.`,
      },
    },
    shared: { persona: "" },
    rag: {
      topK: Number(process.env.RAG_TOP_K ?? 4),
      scoreThreshold: 0,
      gapMatchThreshold: 0.15,
      scoreFloor: 0.35,
      clusterRadius: 0.15,
    },
    public: {
      greeting: `Hi! I'm ${botName}, ${owner}'s personal bot.`,
      suggestions: [
        `What's ${owner}'s tech stack?`,
        "Walk me through a recent project",
        "How do I get in touch?",
      ],
      calUrl: process.env.NEXT_PUBLIC_CAL_URL ?? "",
      githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL ?? "",
      contactEmail: process.env.BOT_CONTACT_EMAIL ?? "naingoted@gmail.com",
      botName,
      botTagline: process.env.BOT_TAGLINE ?? "",
      brandLogoUrl: process.env.BRAND_LOGO_URL ?? "",
      brandAccent: process.env.BRAND_ACCENT ?? "",
      copy: DEFAULT_PUBLIC_COPY,
    },
  };
  // Env values flow into the seeded row without any other validation pass. Run
  // them through the schema so a bad BRAND_LOGO_URL / BRAND_ACCENT env value
  // fails fast at boot instead of reaching the UI un-sanitized.
  return SettingsSchema.parse(raw) as SettingsValue;
}

function toSettingsVersion(updatedAt: Date | string): string {
  return updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt).toISOString();
}

async function readSettingsRows(db: Db) {
  return db.select().from(settings).where(eq(settings.id, 1));
}

export async function getSettingsVersion(db: Db): Promise<string | null> {
  const rows = await db
    .select({ updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return rows[0] ? toSettingsVersion(rows[0].updatedAt) : null;
}

export async function getSettings(db: Db): Promise<SettingsValue> {
  const cached = configCache.getEntry();
  if (cached) {
    const currentVersion = await getSettingsVersion(db).catch(() => null);
    if (currentVersion === cached.version) {
      return cached.value;
    }
  }

  const rows = await readSettingsRows(db);
  let value: SettingsValue;
  let version: string;

  if (rows[0]) {
    value = SettingsSchema.parse({
      agents: rows[0].agents,
      shared: rows[0].shared,
      rag: rows[0].rag,
      public: rows[0].public,
    });
    version = toSettingsVersion(rows[0].updatedAt);
  } else {
    value = defaultSettings();
    const now = new Date();
    await db
      .insert(settings)
      .values({ id: 1, ...value, updatedAt: now })
      .execute();
    version = now.toISOString();
  }

  configCache.set(value, version);
  return value;
}

export async function updateSettings(
  db: Db,
  next: SettingsValue,
  actorIp: string,
): Promise<SettingsValue> {
  const parsed = SettingsSchema.parse(next);
  const before = await getSettings(db);
  const updatedAt = new Date();
  const updatedAtIso = updatedAt.toISOString();
  await db
    .insert(settings)
    .values({ id: 1, ...parsed, updatedAt })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        ...parsed,
        updatedAt: sql`greatest(${updatedAtIso}::timestamptz, ${settings.updatedAt} + interval '1 millisecond')`,
      },
    })
    .execute();
  await logAudit(db, {
    action: "config.update",
    entityType: "settings",
    entityId: "1",
    summary: "updated config",
    meta: { before, after: parsed },
    actorIp,
  });
  configCache.clear();
  return parsed;
}
