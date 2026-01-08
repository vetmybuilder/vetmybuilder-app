/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Allow imports from ../shared (and other external dirs)
  experimental: {
    externalDir: true,
  },

  // Proxy /api/* and /uploads/* to Express backend in dev.
  async rewrites() {
    const apiBase = (
      process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787/api"
    ).replace(/\/+$/, "");
    const uploadsBase = "http://localhost:8787/uploads";

    return [
      // existing API proxy
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`,
      },
      // NEW uploads proxy so /uploads/... works locally
      {
        source: "/uploads/:path*",
        destination: `${uploadsBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
