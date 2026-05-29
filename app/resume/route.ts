import { promises as fs } from "fs";
import { join } from "path";

/**
 * GET /resume — serves content/resume.md as a downloadable file.
 * TODO: Replace with real PDF once owner provides it to public/resume.pdf
 */
export async function GET() {
  try {
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
    console.error("Resume download error:", error);
    return new Response("Resume not found", { status: 404 });
  }
}
