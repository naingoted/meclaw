import { NextResponse } from "next/server";
import { getChatDb, resolveEmbedClient } from "@/lib/embed/auth";

export const dynamic = "force-dynamic";

/**
 * Internal API endpoint for middleware to fetch embed client allowed origins.
 * Middleware runs in Edge Runtime and can't access the DB directly, so it calls
 * this endpoint to get the client info and caches the result.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const db = await getChatDb();
  const client = await resolveEmbedClient(db, token);

  if (!client) {
    return NextResponse.json({ allowedOrigins: null });
  }

  return NextResponse.json({
    allowedOrigins: client.allowedOrigins,
  });
}
