import type { SettingsValue } from "./settings";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function envTtl(): number {
  const raw = process.env.CONFIG_CACHE_TTL_MS;
  if (raw === undefined) return DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS;
}

/**
 * Process-local cache of the settings row. Two freshness mechanisms:
 * - `clear()` busts immediately in the writing process.
 * - `version` is checked against settings.updatedAt before a cached value is
 *   reused by a reader process.
 *
 * The TTL remains a fallback safety valve.
 */
export type ConfigCacheEntry = {
  value: SettingsValue;
  version: string;
  expiresAt: number;
};

export class ConfigCache {
  private entry: ConfigCacheEntry | null = null;

  constructor(
    private readonly ttlMs: number = envTtl(),
    private readonly now: () => number = Date.now,
  ) {}

  getEntry(): ConfigCacheEntry | null {
    if (this.entry === null) return null;
    if (this.now() >= this.entry.expiresAt) {
      this.clear();
      return null;
    }
    return this.entry;
  }

  get(): SettingsValue | null {
    return this.getEntry()?.value ?? null;
  }

  set(value: SettingsValue, version: string): void {
    this.entry = {
      value,
      version,
      expiresAt: this.now() + this.ttlMs,
    };
  }

  clear(): void {
    this.entry = null;
  }
}

export const configCache = new ConfigCache();
