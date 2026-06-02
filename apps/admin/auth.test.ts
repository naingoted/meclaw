import { describe, it, expect, beforeEach } from "vitest";
import { authorizeCredentials } from "./lib/admin/auth-utils";
import { hashPassword } from "./lib/admin/password";

describe("authorizeCredentials", () => {
  beforeEach(async () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = await hashPassword("s3cret");
  });

  it("returns a user for correct creds", async () => {
    const u = await authorizeCredentials({ username: "admin", password: "s3cret" });
    expect(u).toEqual({ id: "admin", name: "admin" });
  });

  it("returns null for wrong password", async () => {
    expect(await authorizeCredentials({ username: "admin", password: "nope" })).toBeNull();
  });

  it("returns null for wrong username", async () => {
    expect(await authorizeCredentials({ username: "x", password: "s3cret" })).toBeNull();
  });
});
