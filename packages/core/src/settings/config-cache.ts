import type { SettingsValue } from "./settings";

/** Process-local cache of the settings row. Busted on every write. */
class ConfigCache {
  private value: SettingsValue | null = null;
  get(): SettingsValue | null { return this.value; }
  set(v: SettingsValue): void { this.value = v; }
  clear(): void { this.value = null; }
}
export const configCache = new ConfigCache();
