import { describe, it, expect } from "vitest";
import { adminGuard } from "./guard";

describe("adminGuard", () => {
  it("allows when ADMIN_ENABLED is not 'false'", () => {
    delete process.env.ADMIN_ENABLED;
    expect(adminGuard()).toBeNull();
  });
  it("blocks with 404 when disabled", () => {
    process.env.ADMIN_ENABLED = "false";
    const res = adminGuard();
    expect(res?.status).toBe(404);
    delete process.env.ADMIN_ENABLED;
  });
});
