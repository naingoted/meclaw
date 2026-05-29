import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Dockerized Playwright MCP browser (reaches the host via
  // host.docker.internal) to load Next dev resources for browser verification.
  // Dev-only; ignored in production builds.
  allowedDevOrigins: ["host.docker.internal"],
};

export default nextConfig;
