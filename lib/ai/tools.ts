import { tool } from "ai";
import { z } from "zod";

/**
 * Owner's email address — single source of truth.
 * Used by getContactInfo tool. Update this if the owner's email changes.
 */
const OWNER_EMAIL = "thetnaing@incube8.sg";

/**
 * getContactInfo — returns the owner's contact details.
 * The model can call this when asked "How do I get in touch?" or similar.
 */
export const getContactInfo = tool({
  description:
    "Get the owner's contact information including email and GitHub profile (if available).",
  inputSchema: z.object({}),
  execute: () => {
    const contactInfo: Record<string, string> = {
      email: OWNER_EMAIL,
    };

    // Include GitHub URL if set in environment
    if (process.env.NEXT_PUBLIC_GITHUB_URL) {
      contactInfo.github = process.env.NEXT_PUBLIC_GITHUB_URL;
    }

    return contactInfo;
  },
});

/**
 * scheduleCall — returns the Cal.com booking link.
 * The model can call this when asked "Can I schedule a call?" or "Let's book a meeting".
 */
export const scheduleCall = tool({
  description:
    "Get the Cal.com booking link so the visitor can schedule a call with the owner.",
  inputSchema: z.object({}),
  execute: () => {
    const calUrl = process.env.NEXT_PUBLIC_CAL_URL || "https://cal.com/tet-nai";
    return {
      url: calUrl,
    };
  },
});

/**
 * showResume — returns the resume download path and instructions.
 * The model can call this when asked "Can I see the resume?" or "Download CV".
 */
export const showResume = tool({
  description:
    "Get the resume download link. Returns a path to the resume file.",
  inputSchema: z.object({}),
  execute: () => {
    return {
      path: "/resume",
      description:
        "The resume is available for download at /resume. You can offer this link to the visitor.",
    };
  },
});

/**
 * howThisWorks — meta tool that explains the bot's architecture.
 * The model can call this when asked "How does this bot work?" or "Tell me about yourself".
 */
export const howThisWorks = tool({
  description:
    "Explain how this bot works: its architecture, knowledge source, and tech stack.",
  inputSchema: z.object({}),
  execute: () => {
    return `echo is a personal AI twin built with Next.js 16 and the Vercel AI SDK v6 (streaming).
The LLM is qwen3.6-plus, accessed via an Anthropic-compatible gateway.
Knowledge about Thet comes from markdown files in the content/ directory. These are chunked and
embedded (nomic-embed-text via Ollama) into a Qdrant vector database; each question is embedded and
the most relevant chunks are retrieved and added to the system prompt (retrieval-augmented generation).
If retrieval is unavailable, it falls back to stuffing the full corpus into the prompt. Conversations
are persisted to a local SQLite database (better-sqlite3) for future reference. The goal is to create
a personalized, always-available chatbot that answers about the owner in a warm, third-person voice.`;
  },
});

/**
 * Tools registry — export all tools as a record for wiring into streamText.
 * The model can decide which tools to call based on user intent.
 */
export const tools = {
  getContactInfo,
  scheduleCall,
  showResume,
  howThisWorks,
};
