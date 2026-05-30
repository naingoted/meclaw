import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image ships only traced deps instead of the full node_modules.
  output: "standalone",

  // Allow the Dockerized Playwright MCP browser (reaches the host via
  // host.docker.internal) to load Next dev resources for browser verification.
  // Dev-only; ignored in production builds.
  allowedDevOrigins: ["host.docker.internal"],
};

export default nextConfig;
