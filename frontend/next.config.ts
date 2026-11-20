import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // minimal self-contained server for the Docker image
  outputFileTracingRoot: path.resolve(process.cwd(), ".."), // npm workspaces: deps are hoisted to the repo root
  // Same-origin proxy to the API: the httpOnly refresh cookie then works without CORS.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${process.env.BACKEND_URL ?? "http://localhost:4000"}/:path*` },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // The /api proxy defaults to a 30s timeout; a local LLM review (cold model load) can take longer.
  experimental: { proxyTimeout: 190_000 },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: {
      // browsers always have fetch; skip the lazy node-fetch fallback of @x-requests/core
      "node-fetch": { browser: "./src/lib/empty.ts" },
    },
  },
};

export default nextConfig;
