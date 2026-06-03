import { describe, expect, it } from "vitest";

import { dynamic } from "./page";

describe("chat home page route config", () => {
  it("renders dynamically so admin config changes can refresh open tabs", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
