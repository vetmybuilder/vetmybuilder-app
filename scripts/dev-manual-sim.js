// scripts/dev-manual-sim.js
// Waits for the API server to be ready, then seeds sim data and starts the daemon.
// Runs as part of `npm run dev:manual` in parallel with the server + web processes.

require("dotenv").config({ path: ".env.e2e.local" });

const { spawn } = require("child_process");

// Never run sim auto-start during E2E tests
if (process.env.TEST_ENV === "e2e" || process.env.CI) {
  process.exit(0);
}

const HEALTH_URL = "http://localhost:3100/health";
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 120_000;

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`  [sim-autostart ${t}] ${msg}`);
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

// Real accounts that need to exist in the local Firebase emulator for manual testing.
// Add entries here if you need to log in as a real (non-sim) user locally.
const EMULATOR_USERS = [
  {
    localId: "pLT7RLEYByX6IJWzGAMjAKrW5L93",
    email: "info@elegantbuilding.co.uk",
    password: "o8hSUU8vagHTyuaOY0ov1w==",
    displayName: "Elegant Building Services",
  },
];

async function ensureEmulatorUsers() {
  const emulatorHost =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const projectId = process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    "vetmybuilder";
  const base = `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/projects/${projectId}`;

  for (const user of EMULATOR_USERS) {
    try {
      const res = await fetch(`${base}/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer owner",
        },
        body: JSON.stringify({ ...user, emailVerified: true }),
      });
      if (res.ok) {
        log(`Emulator user ensured: ${user.email}`);
      } else {
        const body = await res.json().catch(() => ({}));
        // DUPLICATE_EMAIL means user already exists — that's fine
        if (body?.error?.message !== "DUPLICATE_EMAIL") {
          log(`Warning: could not create emulator user ${user.email}: ${body?.error?.message}`);
        }
      }
    } catch (e) {
      log(`Warning: emulator user creation skipped (${user.email}): ${e.message}`);
    }
  }
}

function runScript(script, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      ["scripts/simulate.js", script],
      {
        stdio: "inherit",
        env: { ...process.env, ...env },
      }
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`simulate.js ${script} exited with code ${code}`));
    });
  });
}

(async () => {
  log("Waiting for API server...");
  const ready = await waitForServer();
  if (!ready) {
    log("Server did not become ready in time — skipping sim autostart");
    process.exit(1);
  }

  // Ensure known real-account test users exist in the emulator
  await ensureEmulatorUsers();

  log("Server ready. Running seed...");
  try {
    await runScript("seed");
  } catch (e) {
    log(`Seed failed: ${e.message}`);
    process.exit(1);
  }

  log("Seed complete. Starting daemon...");
  // Daemon runs forever — inherit its stdio so logs appear in the terminal
  const daemon = spawn("node", ["scripts/simulate.js", "daemon"], {
    stdio: "inherit",
    env: { ...process.env, SIM_MODE: "auto" },
  });

  daemon.on("exit", (code) => process.exit(code ?? 0));
})();
