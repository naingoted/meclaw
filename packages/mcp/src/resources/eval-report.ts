import { readFile } from "node:fs/promises";

/**
 * Spec B's latest eval report. Soft dependency — returns a placeholder when the
 * report file does not exist yet.
 */
export async function latestEvalReport(
  path = "services/ai/out/report.json",
): Promise<{ available: boolean; content: string }> {
  try {
    return { available: true, content: await readFile(path, "utf8") };
  } catch {
    return { available: false, content: "No eval report yet — Spec B has not produced one." };
  }
}
