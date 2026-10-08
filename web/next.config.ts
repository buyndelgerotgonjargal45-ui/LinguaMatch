import type { NextConfig } from "next";

// One .env at the repo root serves both apps.
try {
  process.loadEnvFile("../.env");
} catch {
  // No root .env — rely on the environment / web/.env.local.
}

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@linguamatch/shared"],
  // Proxy REST calls so the session cookie is first-party. Socket.IO connects directly.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
