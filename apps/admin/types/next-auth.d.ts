import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    username: string;
    role: "super_admin" | "admin";
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      role: "super_admin" | "admin";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    username?: string;
    role?: "super_admin" | "admin";
  }
}
