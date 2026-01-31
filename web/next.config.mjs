/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    externalDir: true,
  },

  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3100",
    "http://127.0.0.1:3100",
    "http://localhost:3101",
    "http://127.0.0.1:3101",
    "http://localhost:3102",
    "http://127.0.0.1:3102",
    "http://localhost:3103",
    "http://127.0.0.1:3103",
    "http://localhost:3200",
    "http://127.0.0.1:3200",
  ],

  async rewrites() {
    // Allow NEXT_PUBLIC_API_BASE to be either:
    //  - http://localhost:3200        (origin)
    //  - http://localhost:3200/api    (origin + /api)
    // Normalize so /api/* always forwards to the Express /api router.
    const base = (
      process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100"
    ).replace(/\/+$/, "");

    const apiBase = base.endsWith("/api") ? base : `${base}/api`;
    const originBase = apiBase.replace(/\/api$/, "");
    const uploadsBase = `${originBase}/uploads`;

    return [
      { source: "/api/:path*", destination: `${apiBase}/:path*` },
      { source: "/uploads/:path*", destination: `${uploadsBase}/:path*` },
    ];
  },
};

export default nextConfig;
