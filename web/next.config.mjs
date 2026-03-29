/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    externalDir: true,
  },

  allowedDevOrigins: [
    // host runs
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3003",

    // api ports on host (if you ever hit them directly)
    "http://localhost:3100",
    "http://127.0.0.1:3100",
    "http://localhost:3101",
    "http://127.0.0.1:3101",
    "http://localhost:3102",
    "http://127.0.0.1:3102",
    "http://localhost:3103",
    "http://127.0.0.1:3103",

    // docker compose service-to-service origins (THIS is the missing bit)
    "http://web-w0:3000",
    "http://web-w1:3000",
    "http://web-w2:3000",
    "http://web-w3:3000",
    "http://server-w0:3100",
    "http://server-w1:3101",
    "http://server-w2:3102",
    "http://server-w3:3103",
  ],

  async rewrites() {
    // API_BASE is always shard-0's server (http://localhost:3100 by default).
    // Workers 1+ are handled by per-shard HTTP proxies (scripts/dev-manual-proxy.js)
    // that intercept requests BEFORE they reach Next.js, so no cookie-based
    // shard routing is needed here.
    const apiServerBase = "http://localhost:3100";

    return {
      afterFiles: [
        { source: "/api/:path*", destination: `${apiServerBase}/api/:path*` },
        {
          source: "/uploads/:path*",
          destination: `${apiServerBase}/uploads/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
