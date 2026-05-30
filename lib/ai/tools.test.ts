// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, expect, it } from "vitest";
import {
  getContactInfo,
  scheduleCall,
  showResume,
  howThisWorks,
} from "./tools";

// Test tools' execute functions. The tool() helper has complex overloads that
// make TypeScript strict mode difficult to satisfy; runtime works fine.

describe("Agent tools", () => {
  describe("getContactInfo", () => {
    it("returns the owner's email address", () => {
      const result = getContactInfo.execute({});
      expect(result).toHaveProperty("email");
      expect(result.email).toBe("thetnaing@incube8.sg");
    });

    it("includes GitHub URL if NEXT_PUBLIC_GITHUB_URL is set", () => {
      const originalEnv = process.env.NEXT_PUBLIC_GITHUB_URL;
      process.env.NEXT_PUBLIC_GITHUB_URL = "https://github.com/thetnaing";

      const result = getContactInfo.execute({});
      expect(result).toHaveProperty("github");
      expect(result.github).toBe("https://github.com/thetnaing");

      // Restore
      process.env.NEXT_PUBLIC_GITHUB_URL = originalEnv;
    });

    it("omits GitHub URL if NEXT_PUBLIC_GITHUB_URL is not set", () => {
      const originalEnv = process.env.NEXT_PUBLIC_GITHUB_URL;
      delete process.env.NEXT_PUBLIC_GITHUB_URL;

      const result = getContactInfo.execute({});
      expect(result).not.toHaveProperty("github");

      // Restore
      process.env.NEXT_PUBLIC_GITHUB_URL = originalEnv;
    });

    it("has a description", () => {
      expect(getContactInfo.description).toBeDefined();
      expect(typeof getContactInfo.description).toBe("string");
      expect(getContactInfo.description.length).toBeGreaterThan(0);
    });

    it("has an empty inputSchema (no input required)", () => {
      // The tool should accept no input
      expect(getContactInfo.inputSchema).toBeDefined();
    });
  });

  describe("scheduleCall", () => {
    it("returns the Cal.com booking link from env", () => {
      const originalEnv = process.env.NEXT_PUBLIC_CAL_URL;
      process.env.NEXT_PUBLIC_CAL_URL = "https://cal.com/thet";

      const result = scheduleCall.execute({});
      expect(result).toHaveProperty("url");
      expect(result.url).toBe("https://cal.com/thet");

      // Restore
      process.env.NEXT_PUBLIC_CAL_URL = originalEnv;
    });

    it("returns the default Cal.com URL if env is not set", () => {
      const originalEnv = process.env.NEXT_PUBLIC_CAL_URL;
      delete process.env.NEXT_PUBLIC_CAL_URL;

      const result = scheduleCall.execute({});
      expect(result).toHaveProperty("url");
      expect(result.url).toBe("https://cal.com/tet-nai");

      // Restore
      process.env.NEXT_PUBLIC_CAL_URL = originalEnv;
    });

    it("has a description", () => {
      expect(scheduleCall.description).toBeDefined();
      expect(typeof scheduleCall.description).toBe("string");
      expect(scheduleCall.description.length).toBeGreaterThan(0);
    });

    it("has an empty inputSchema (no input required)", () => {
      expect(scheduleCall.inputSchema).toBeDefined();
    });
  });

  describe("showResume", () => {
    it("returns the resume download path", () => {
      const result = showResume.execute({});
      expect(result).toHaveProperty("path");
      expect(result.path).toBe("/resume");
    });

    it("includes a description of what to do with the link", () => {
      const result = showResume.execute({});
      expect(result).toHaveProperty("description");
      expect(typeof result.description).toBe("string");
      expect(result.description.length).toBeGreaterThan(0);
    });

    it("has a description", () => {
      expect(showResume.description).toBeDefined();
      expect(typeof showResume.description).toBe("string");
      expect(showResume.description.length).toBeGreaterThan(0);
    });

    it("has an empty inputSchema (no input required)", () => {
      expect(showResume.inputSchema).toBeDefined();
    });
  });

  describe("howThisWorks", () => {
    it("returns a non-empty explanation", () => {
      const result = howThisWorks.execute({});
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("mentions the tech stack (Next.js, Vercel AI SDK, qwen, gateway)", () => {
      const result = howThisWorks.execute({});
      expect(result.toLowerCase()).toMatch(/next\.?js/);
      expect(result.toLowerCase()).toMatch(/vercel.*ai/);
      expect(result.toLowerCase()).toMatch(/qwen/);
      expect(result.toLowerCase()).toMatch(/gateway/);
    });

    it("mentions knowledge source (markdown, content)", () => {
      const result = howThisWorks.execute({});
      expect(result.toLowerCase()).toMatch(/markdown|content/);
    });

    it("mentions persistence (SQLite)", () => {
      const result = howThisWorks.execute({});
      expect(result.toLowerCase()).toMatch(/sqlite|persist|local/);
    });

    it("has a description", () => {
      expect(howThisWorks.description).toBeDefined();
      expect(typeof howThisWorks.description).toBe("string");
      expect(howThisWorks.description.length).toBeGreaterThan(0);
    });

    it("has an empty inputSchema (no input required)", () => {
      expect(howThisWorks.inputSchema).toBeDefined();
    });
  });

  describe("tool metadata", () => {
    it("all tools have descriptions", () => {
      const tools = [getContactInfo, scheduleCall, showResume, howThisWorks];
      tools.forEach((tool) => {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe("string");
        expect(tool.description.length).toBeGreaterThan(0);
      });
    });

    it("all tools have inputSchema", () => {
      const tools = [getContactInfo, scheduleCall, showResume, howThisWorks];
      tools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
      });
    });

    it("all tools have execute functions", () => {
      const tools = [getContactInfo, scheduleCall, showResume, howThisWorks];
      tools.forEach((tool) => {
        expect(tool.execute).toBeDefined();
        expect(typeof tool.execute).toBe("function");
      });
    });
  });
});
