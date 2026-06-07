import { describe, expect, it } from "vitest";
import { PII_COLUMNS, redactRows } from "./redact";

describe("redactRows", () => {
  it("masks allowlisted PII columns when allowPii is false", () => {
    const rows = [{ id: "1", email: "a@b.com", phone: "123", title: "Engineer" }];
    const out = redactRows(rows, false);
    expect(out[0]).toEqual({
      id: "1",
      email: "[redacted]",
      phone: "[redacted]",
      title: "Engineer",
    });
  });

  it("passes everything through when allowPii is true", () => {
    const rows = [{ id: "1", email: "a@b.com" }];
    expect(redactRows(rows, true)).toEqual(rows);
  });

  it("leaves non-PII columns untouched", () => {
    const rows = [{ id: "1", intent: "tech" }];
    expect(redactRows(rows, false)).toEqual(rows);
  });

  it("includes known PII fields in the allowlist", () => {
    expect(PII_COLUMNS).toContain("email");
    expect(PII_COLUMNS).toContain("phone");
    expect(PII_COLUMNS).toContain("content");
    expect(PII_COLUMNS).toContain("triggerQuestion");
  });
});
