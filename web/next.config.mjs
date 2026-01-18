/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    externalDir: true,
  },

  allowedDevOrigins: [
    "http://localhost:3000",
    "http://localhost:3000",
    "http://localhost:3100",
    "http://localhost:3100",
    "http://localhost:3101",
    "http://localhost:3101",
    "http://localhost:3102",
    "http://localhost:3102",
    "http://localhost:3103",
    "http://localhost:3103",
  ],

  async rewrites() {
    const apiBase = (
      process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100/api"
    ).replace(/\/+$/, "");

    const uploadsBase = apiBase.replace(/\/api$/, "") + "/uploads";

    return [
      { source: "/api/:path*", destination: `${apiBase}/:path*` },
      { source: "/uploads/:path*", destination: `${uploadsBase}/:path*` },
    ];
  },
};

export default nextConfig;
