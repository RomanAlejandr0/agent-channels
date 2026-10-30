import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  devIndicators: false,
  async rewrites() {
    const backend =
      process.env.AGENT_CHANNELS_BACKEND || "http://127.0.0.1:4311";
    return [
      "/api/:path*",
      "/mcp",
      "/authorize",
      "/token",
      "/register",
      "/revoke",
      "/.well-known/:path*",
      "/health",
    ].map((source) => ({ source, destination: `${backend}${source}` }));
  },
};
export default config;
