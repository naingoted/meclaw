import { describe, expect, it } from "vitest";
import { howThisWorks, ownerContact, scheduleCall, showResume } from "./static-tools";

describe("static tools", () => {
  it("ownerContact returns email + github from env", () => {
    expect(ownerContact({ NEXT_PUBLIC_GITHUB_URL: "https://github.com/x" })).toEqual({
      email: "naingoted@gmail.com",
      github: "https://github.com/x",
    });
  });

  it("ownerContact omits github when unset", () => {
    expect(ownerContact({})).toEqual({ email: "naingoted@gmail.com" });
  });

  it("scheduleCall falls back to the default Cal URL", () => {
    expect(scheduleCall({})).toEqual({ url: "https://cal.com/tet-nai" });
  });

  it("showResume returns the /resume path", () => {
    expect(showResume().path).toBe("/resume");
  });

  it("howThisWorks returns a non-empty description string", () => {
    expect(howThisWorks().length).toBeGreaterThan(20);
  });
});
