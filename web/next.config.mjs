// Content-Security-Policy is shipped in REPORT-ONLY mode first: it never
// blocks anything, it only reports violations, so we can watch for breakage
// (GTM, PostHog, Firebase, Google Fonts, SSO) before switching the header
// name to "Content-Security-Policy" to enforce. Inline script/style is still
// allowed here because the pages router relies on it; tightening to nonces is
// a follow-up.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' https: data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  // Browsers stick to HTTPS for a year. Only honored over HTTPS, so it pairs
  // with the nginx HTTP->HTTPS redirect. `preload` is intentionally omitted
  // (hard to undo); add it later if you submit to the preload list.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: CONTENT_SECURITY_POLICY,
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Drop the "X-Powered-By: Next.js" stack-fingerprinting header.
  poweredByHeader: false,
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
        // Acquisition short link: /go/<ref-code> -> the scan-logging
        // API endpoint, which 302s on to the trade signup landing page
        // with ?ref=<ref-code>. Lets the printed QR carry a friendly
        // /go/flyer-e4 URL instead of /api/track/go/flyer-e4.
        {
          source: "/go/:code",
          destination: `${apiServerBase}/api/track/go/:code`,
        },
      ],
    };
  },

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
