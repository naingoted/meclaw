import { auth } from "@/auth";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api/auth");

  if (!req.auth && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
