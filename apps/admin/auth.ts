import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "./lib/admin/auth-utils";

function isSessionRole(role: unknown): role is "super_admin" | "admin" {
  return role === "super_admin" || role === "admin";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      authorize: (creds) => authorizeCredentials(creds ?? {}),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (typeof token.id === "string" && token.id.length > 0) {
          session.user.id = token.id;
        }
        if (typeof token.username === "string" && token.username.length > 0) {
          session.user.username = token.username;
        }
        if (isSessionRole(token.role)) {
          session.user.role = token.role;
        }
      }
      return session;
    },
  },
});
