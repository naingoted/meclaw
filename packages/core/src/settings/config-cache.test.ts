import { describe, it, expect } from "vitest";
import { ConfigCache } from "./config-cache";
import { defaultSettings } from "./settings";

const sample = defaultSettings();

describe("ConfigCache TTL", () => {
  it("returns the cached entry before expiry", () => {
    const t = 1000;
    const cache = new ConfigCache(5000, () => t);
    cache.set(sample, "2026-06-03T00:00:00.000Z");
    expect(cache.getEntry()).toEqual({
      value: sample,
      version: "2026-06-03T00:00:00.000Z",
      expiresAt: 6000,
    });
    expect(cache.get()).toEqual(sample);
  });

  it("returns null once the TTL has elapsed", () => {
    let t = 1000;
    const cache = new ConfigCache(5000, () => t);
    cache.set(sample, "2026-06-03T00:00:00.000Z");
    t = 6000; // 1000 + 5000 = expiry boundary
    expect(cache.getEntry()).toBeNull();
    expect(cache.get()).toBeNull();
  });

  it("clear() busts the value immediately", () => {
    const cache = new ConfigCache(5000, () => 1000);
    cache.set(sample, "2026-06-03T00:00:00.000Z");
    cache.clear();
    expect(cache.getEntry()).toBeNull();
    expect(cache.get()).toBeNull();
  });
});
