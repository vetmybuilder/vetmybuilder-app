/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: { buildActivity: false },

  experimental: {
    externalDir: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "web-w0",
    "web-w1",
    "web-w2",
    "web-w3",
    "server-w0",
    "server-w1",
    "server-w2",
    "server-w3",
  ],

  async rewrites() {
    // API_BASE is always shard-0's server (http://localhost:3100 by default).
    // Workers 1+ are handled by per-shard HTTP proxies (scripts/dev-manual-proxy.js)
    // that intercept requests BEFORE they reach Next.js, so no cookie-based
    // shard routing is needed here.
    // In Docker, set NEXT_INTERNAL_API_BASE=http://server-w0:3100
    const apiServerBase =
      process.env.NEXT_INTERNAL_API_BASE || "http://localhost:3100";

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
