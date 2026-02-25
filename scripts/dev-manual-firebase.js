// scripts/dev-manual-firebase.js
const { spawn } = require("child_process");
const path = require("path");
const { logger } = require("../server/lib/logger");

function resolveFirebaseToolsBin() {
  // Prefer local dependency so offline dev works.
  // Requires: npm i -D firebase-tools
  try {
    return require.resolve("firebase-tools/lib/bin/firebase.js", {
      paths: [process.cwd()],
    });
  } catch (e) {
    logger.error(
      { err: e?.message || e },
      "[dev-manual-firebase] firebase-tools not found. Install it as a devDependency: npm i -D firebase-tools",
    );
    process.exit(1);
  }
}

function run() {
  // Ensure host env for BOTH server + web processes spawned by npm-run-all
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

  const projectIdScript = path.resolve(
    __dirname,
    "print-firebase-project-id.js",
  );
  const node = process.execPath;

  const projectIdProc = spawn(node, [projectIdScript], {
    stdio: ["ignore", "pipe", "inherit"],
    env: process.env,
  });

  let projectId = "";
  projectIdProc.stdout.on("data", (d) => (projectId += String(d)));

  projectIdProc.on("close", (code) => {
    if (code !== 0) {
      logger.error(
        { exitCode: code },
        "[dev-manual-firebase] Failed to resolve Firebase project id",
      );
      process.exit(code || 1);
    }

    const id = projectId.trim();
    if (!id) {
      logger.error("[dev-manual-firebase] Empty Firebase project id");
      process.exit(1);
    }

    logger.info(
      { projectId: id },
      "[dev-manual-firebase] Starting auth emulator",
    );

    const firebaseBin = resolveFirebaseToolsBin();

    // Use the local firebase-tools bin via node (no npx/network).
    // NOTE: do NOT pass --ui; firebase-tools 15.7.0 errors with "unknown option '--ui'"
    const args = [
      firebaseBin,
      "emulators:start",
      "--only",
      "auth",
      "--project",
      id,
      "--config",
      path.resolve(__dirname, "..", "firebase.json"),
    ];

    const child = spawn(node, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (exitCode) => {
      logger.info({ exitCode }, "[dev-manual-firebase] Auth emulator exited");
      process.exit(exitCode ?? 0);
    });
  });
}

run();
