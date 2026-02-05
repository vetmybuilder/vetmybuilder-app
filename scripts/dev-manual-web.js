// scripts/dev-manual-web.js
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(REPO_ROOT, "web");

// Playwright sets PORT per shard
const port = process.env.PORT || "3000";

// We only want to do this for e2e runs.
const isE2E = process.env.TEST_ENV === "e2e";

// Basic build artifact check
const nextBuildId = path.join(WEB_DIR, ".next", "BUILD_ID");

// Simple build lock so 2 shards don’t build at the same time
const lockFile = path.join(REPO_ROOT, ".next-build.lock");

function acquireLock() {
  try {
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(lockFile);
  } catch {}
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd,
    env: opts.env,
  });

  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

function start(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd,
    env: opts.env,
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
}

function ensureBuilt() {
  if (fs.existsSync(nextBuildId)) return;

  // Wait for another shard to finish building if locked
  while (!acquireLock()) {
    if (fs.existsSync(nextBuildId)) return;
    sleep(300);
  }

  try {
    // Another shard may have built while we waited
    if (fs.existsSync(nextBuildId)) return;

    console.log(`[web] building Next app once (shared) ...`);
    run("npm", ["run", "build"], { cwd: WEB_DIR, env: process.env });
  } finally {
    releaseLock();
  }
}

if (isE2E) {
  ensureBuilt();

  // Production server: no Fast Refresh, no dev reloads
  console.log(`[web] starting Next (prod) on port ${port}`);
  start("npm", ["run", "start", "--", "-p", String(port)], {
    cwd: WEB_DIR,
    env: process.env,
  });
} else {
  // Dev mode fallback for local manual usage
  console.log(`[web] starting Next (dev) on port ${port}`);
  start("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: WEB_DIR,
    env: process.env,
  });
}
