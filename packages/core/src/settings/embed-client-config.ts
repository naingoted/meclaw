import type { PublicCopy } from "./public-copy";
import type { SettingsValue } from "./settings";

/** Public embed surface — no agent prompts, RAG knobs, or secrets. */
export type EmbedClientConfig = {
  /** Settings row version (ISO timestamp); poll to detect admin edits. */
  version: string;
  /** Build-time release label, e.g. `meclaw · v1.2.3 · abc1234`. */
  versionLabel: string;
  greeting: string;
  suggestions: string[];
  botName: string;
  brandLogoUrl: string;
  brandAccent: string;
  copy: PublicCopy;
};

export function toEmbedClientConfig(
  settings: SettingsValue,
  version: string,
  versionLabel: string,
): EmbedClientConfig {
  const { greeting, suggestions, botName, brandLogoUrl, brandAccent, copy } = settings.public;
  return {
    version,
    versionLabel,
    greeting,
    suggestions,
    botName,
    brandLogoUrl,
    brandAccent,
    copy,
  };
}
