import { contentDir } from "@meclaw/core/content";
import { promises as fs } from "fs";
import { join } from "path";

/**
 * GET /resume — serves content/resume.md as a downloadable file.
 * TODO: Replace with real PDF once owner provides it to public/resume.pdf
 */
export async function GET() {
  try {
    // content/ root comes from @meclaw/core's contentDir() — honors
    // MECLAW_CONTENT_DIR (set to /app/content in the prod image, where the
    // corpus is bind-mounted rather than baked in), else <cwd>/content for dev.
    const resumePath = join(contentDir(), "resume.md");
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
