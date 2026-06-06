import { describe, expect, it } from "vitest";
import { checkBearer } from "./auth";

describe("checkBearer", () => {
  it("passes when the header matches the token", () => {
    expect(checkBearer("Bearer secret", "secret")).toBe(true);
  });
  it("fails on mismatch or missing header", () => {
    expect(checkBearer("Bearer wrong", "secret")).toBe(false);
    expect(checkBearer(undefined, "secret")).toBe(false);
  });
  it("fails closed when no token is configured", () => {
    expect(checkBearer("Bearer anything", undefined)).toBe(false);
  });
});
