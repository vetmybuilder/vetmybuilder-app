// web/next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Allow imports from ../shared (and other external dirs)
  experimental: {
    externalDir: true,
  },

  // Proxy /api/* from Next (3000) to your Express API (8787) in dev.
  // You can override with NEXT_PUBLIC_API_BASE (must include /api).
  async rewrites() {
    const dest = (
      process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787/api"
    ).replace(/\/+$/, "");

    return [
      {
        source: "/api/:path*",
        destination: `${dest}/:path*`,
      },
    ];
  },
};

export default nextConfig;
