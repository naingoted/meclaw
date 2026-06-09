import { getCachedOrigins, setCachedOrigins } from "@meclaw/core/embed-cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Fetch allowed origins for an embed token from the internal API.
 * Called by middleware on cache miss (middleware runs in Edge Runtime, can't access DB).
 */
async function fetchEmbedClientOrigins(
  token: string,
  requestUrl: string,
): Promise<string[] | null> {
  try {
    const apiUrl = new URL("/api/internal/embed-client", requestUrl);
    apiUrl.searchParams.set("token", token);
    const apiRes = await fetch(apiUrl.toString());
    if (!apiRes.ok) return null;
    const data = await apiRes.json();
    return data.allowedOrigins ?? null;
  } catch (err) {
    console.error("[middleware] Failed to fetch embed client:", err);
    return null;
  }
}

// fallow-ignore-next-line complexity
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.nextUrl.pathname.startsWith("/widget")) {
    return response;
  }

  const token = request.nextUrl.searchParams.get("embedToken");
  if (!token) return response;

  // Check cache first, fetch from API on miss
  let allowedOrigins = getCachedOrigins(token);
  if (allowedOrigins === null) {
    allowedOrigins = await fetchEmbedClientOrigins(token, request.url);
    if (allowedOrigins !== null) {
      setCachedOrigins(token, allowedOrigins);
    }
  }

  // Set CSP header based on allowed origins
  if (allowedOrigins && allowedOrigins.length > 0) {
    response.headers.set("Content-Security-Policy", `frame-ancestors ${allowedOrigins.join(" ")}`);
  } else if (allowedOrigins !== null) {
    // Empty array = block all framing
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }

  return response;
}

export const config = {
  matcher: ["/widget/:path*"],
};
