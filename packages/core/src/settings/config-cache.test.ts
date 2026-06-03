import { describe, it, expect } from "vitest";
import { ConfigCache } from "./config-cache";
import { defaultSettings } from "./settings";

const sample = defaultSettings();

describe("ConfigCache TTL", () => {
  it("returns the cached value before expiry", () => {
    let t = 1000;
    const cache = new ConfigCache(5000, () => t);
    cache.set(sample);
    expect(cache.get()).toEqual(sample);
  });

  it("returns null once the TTL has elapsed", () => {
    let t = 1000;
    const cache = new ConfigCache(5000, () => t);
    cache.set(sample);
    t = 6000; // 1000 + 5000 = expiry boundary
    expect(cache.get()).toBeNull();
  });

  it("clear() busts the value immediately", () => {
    const cache = new ConfigCache(5000, () => 1000);
    cache.set(sample);
    cache.clear();
    expect(cache.get()).toBeNull();
  });
});
