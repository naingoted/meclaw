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
 * - `clear()` busts immediately (called on every write — instant freshness in
 *   the writing process, i.e. admin).
 * - a TTL expires the value so a *non-writing* process (chat) re-reads the DB
 *   within `ttlMs`. This is the only cross-process freshness channel, since the
 *   DB is the only thing both processes share. Default 30 min; override via
 *   CONFIG_CACHE_TTL_MS.
 */
export class ConfigCache {
  private value: SettingsValue | null = null;
  private expiresAt = 0;

  constructor(
    private readonly ttlMs: number = envTtl(),
    private readonly now: () => number = Date.now,
  ) {}

  get(): SettingsValue | null {
    if (this.value === null) return null;
    if (this.now() >= this.expiresAt) {
      this.value = null;
      return null;
    }
    return this.value;
  }

  set(v: SettingsValue): void {
    this.value = v;
    this.expiresAt = this.now() + this.ttlMs;
  }

  clear(): void {
    this.value = null;
    this.expiresAt = 0;
  }
}

export const configCache = new ConfigCache();
