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

  async redirects() {
    // Retired legacy URL. Homeowner chat notifications used to deep-link
    // here so the project page's bottom dock could pop the chat window.
    // The standalone /chat/:matchId page is the canonical surface now;
    // any visit to the old URL (stale notification, bookmark, typed URL)
    // gets a server-side 308 to the new page so the project view is
    // never rendered for those requests.
    return [
      {
        source: "/projects/:id",
        has: [{ type: "query", key: "openChat", value: "(?<m>\\d+)" }],
        destination: "/chat/:m",
        permanent: true,
      },
    ];
  },

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
