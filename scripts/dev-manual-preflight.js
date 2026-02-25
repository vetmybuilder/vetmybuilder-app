// scripts/dev-manual-preflight.js
const net = require("net");
const { spawnSync } = require("child_process");
const { logger } = require("../server/lib/logger");

// Ports dev:manual owns
const PORTS = [3000, 3100, 9099, 4000, 4400];

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => {
      try {
        socket.destroy();
      } catch {}
      resolve(open);
    };

    socket.setTimeout(350);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

function killPort(port) {
  // macOS/Linux
  const cmd = `lsof -ti tcp:${port} | xargs -r kill -9`;
  spawnSync("sh", ["-lc", cmd], { stdio: "ignore" });
}

(async () => {
  const stale = [];

  for (const p of PORTS) {
    if (await isPortOpen(p)) stale.push(p);
  }

  if (stale.length) {
    logger.warn({ ports: stale }, "Killing stale processes");
    for (const p of stale) killPort(p);
  } else {
    logger.info("No stale dev processes detected");
  }

  // Optional DB reset hook (only when explicitly requested)
  if (process.env.RESET_DB === "1") {
    logger.info("RESET_DB=1 -> running dev:manual:clean");
    const res = spawnSync("npm", ["run", "dev:manual:clean"], {
      stdio: "inherit",
    });
    process.exit(res.status ?? 0);
  }

  process.exit(0);
})();
