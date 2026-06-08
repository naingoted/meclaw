import { type NextRequest, NextResponse } from "next/server";
import { frameAncestorsHeader, getChatDb, resolveEmbedClient } from "@/lib/embed/auth";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Only apply CSP to /widget routes
  if (request.nextUrl.pathname.startsWith("/widget")) {
    const token = request.nextUrl.searchParams.get("embedToken");
    const db = await getChatDb();
    const client = await resolveEmbedClient(db, token);
    const csp = frameAncestorsHeader(client);
    response.headers.set("Content-Security-Policy", csp);
  }

  return response;
}

export const config = {
  matcher: ["/widget/:path*"],
};
