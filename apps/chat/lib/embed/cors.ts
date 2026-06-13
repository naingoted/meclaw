/** CORS headers for browser cross-origin requests. Never uses `*`. */
export function corsHeaders(origin: string | null): HeadersInit {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function corsPreflightHeaders(origin: string, methods: string): HeadersInit {
  return {
    ...corsHeaders(origin),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonWithCors(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(origin), ...extraHeaders },
  });
}
