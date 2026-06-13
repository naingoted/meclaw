import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  allowedDevOrigins: ["host.docker.internal", "http://localhost:3002", "http://localhost:8080"],
};

export default nextConfig;
