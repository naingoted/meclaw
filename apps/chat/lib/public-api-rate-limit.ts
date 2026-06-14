import { createRateLimiter, type RateLimitResult } from "./rate-limit";

const PUBLIC_API_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv(
  "PUBLIC_API_RATE_LIMIT_MAX_REQUESTS",
  120,
);
const PUBLIC_API_GLOBAL_RATE_LIMIT_PER_MIN = parsePositiveIntEnv(
  "PUBLIC_API_GLOBAL_RATE_LIMIT_PER_MIN",
  600,
);

const perIpLimiter = createRateLimiter({
  maxRequests: PUBLIC_API_RATE_LIMIT_MAX_REQUESTS,
  windowMs: 60_000,
});

const globalLimiter = createRateLimiter({
  maxRequests: PUBLIC_API_GLOBAL_RATE_LIMIT_PER_MIN,
  windowMs: 60_000,
});

export function checkPublicApiLimit(req: Request, scope: string): Response | null {
  const origin = req.headers.get("Origin");
  const ipResult = perIpLimiter.check(`${scope}:${getClientIp(req)}`);
  if (!ipResult.allowed) return rateLimitResponse(ipResult, origin);

  const globalResult = globalLimiter.check(scope);
  if (!globalResult.allowed) return rateLimitResponse(globalResult, origin);

  return null;
}

function rateLimitResponse(result: RateLimitResult, origin: string | null): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Retry-After": String(result.retryAfter ?? 60),
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers },
  );
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
