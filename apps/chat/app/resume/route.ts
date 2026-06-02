import { promises as fs } from "fs";
import { join } from "path";

/**
 * GET /resume — serves content/resume.md as a downloadable file.
 * TODO: Replace with real PDF once owner provides it to public/resume.pdf
 */
export async function GET() {
  try {
    // content/ is resolved from process.cwd() — the same convention as
    // @meclaw/core/content and @meclaw/rag. The standalone prod image runs from
    // /app with content/ bind-mounted there (the corpus is not baked into the
    // image); run dev from a cwd that contains content/ (the repo root).
    const resumePath = join(process.cwd(), "content", "resume.md");
    const content = await fs.readFile(resumePath, "utf-8");

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="thet-naing-resume.md"',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("Resume download error:", message);
    return new Response("Resume not found", { status: 404 });
  }
}
