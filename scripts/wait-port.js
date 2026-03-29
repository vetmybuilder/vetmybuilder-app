const { spawnSync } = require("child_process");
const path = require("path");
const { logger } = require("../server/lib/logger"); // keep your existing import if already here

function waitForAuthEmulator() {
  const host = (
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"
  ).split(":")[0];
  const port = Number(
    (process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099").split(
      ":",
    )[1] || 9099,
  );

  logger.info(
    { host, port },
    "Waiting for Firebase Auth Emulator to be reachable",
  );

  const res = spawnSync("node", [path.resolve(__dirname, "./wait-port.js")], {
    stdio: "inherit",
    env: {
      ...process.env,
      WAIT_HOST: host,
      WAIT_PORT: String(port),
      WAIT_TIMEOUT_MS: process.env.WAIT_TIMEOUT_MS || "120000",
    },
  });

  if ((res.status ?? 1) !== 0) {
    logger.error(
      { status: res.status },
      "Auth emulator did not become reachable in time",
    );
    process.exit(res.status ?? 1);
  }
}

waitForAuthEmulator();
