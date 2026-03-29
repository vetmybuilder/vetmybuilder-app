/**
 * Transparent HTTP + WebSocket proxy for E2E parallel testing.
 *
 * Worker N's browser hits port 3000+N (this proxy).
 * Routes:
 *   /api/*      → http://127.0.0.1:{3100+N}  (API shard N)
 *   /uploads/*  → http://127.0.0.1:{3100+N}  (API shard N)
 *   everything else (HTML, assets, WebSocket HMR) → http://127.0.0.1:3000 (Next.js)
 *
 * Usage: SHARD_INDEX=1 node scripts/dev-manual-proxy.js
 */

const http = require("http");
const net = require("net");

const SHARD_INDEX = parseInt(process.env.SHARD_INDEX || "1", 10);
const LISTEN_PORT = 3000 + SHARD_INDEX;
const API_PORT = 3100 + SHARD_INDEX;
const WEB_PORT = parseInt(process.env.WEB_PORT || "3000", 10);

function isApiOrUploads(url) {
  return (
    url === "/api" ||
    url.startsWith("/api/") ||
    url === "/uploads" ||
    url.startsWith("/uploads/")
  );
}

function proxyHttpRequest(req, res, targetPort) {
  const opts = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(
      `[proxy:${LISTEN_PORT}] upstream error to :${targetPort}: ${err.message}`,
    );
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad Gateway");
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  const targetPort = isApiOrUploads(req.url) ? API_PORT : WEB_PORT;
  proxyHttpRequest(req, res, targetPort);
});

// Tunnel WebSocket upgrades to Next.js (for HMR)
server.on("upgrade", (req, socket, head) => {
  const conn = net.createConnection(WEB_PORT, "127.0.0.1");

  conn.on("connect", () => {
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    conn.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head && head.length) conn.write(head);
    conn.pipe(socket);
    socket.pipe(conn);
  });

  conn.on("error", () => socket.destroy());
  socket.on("error", () => conn.destroy());
});

server.on("error", (err) => {
  console.error(`[proxy:${LISTEN_PORT}] server error:`, err.message);
});

server.listen(LISTEN_PORT, "127.0.0.1", () => {
  console.log(
    `[proxy:${LISTEN_PORT}] started → /api|uploads → :${API_PORT}, rest → :${WEB_PORT}`,
  );
});
