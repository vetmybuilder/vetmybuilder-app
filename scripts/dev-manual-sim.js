// scripts/dev-manual-sim.js
// Waits for the API server to be ready, then seeds sim data and starts the daemon.
// Runs as part of `npm run dev:manual` in parallel with the server + web processes.

require("dotenv").config({ path: ".env.e2e.local" });

const { spawn } = require("child_process");

// Never run sim auto-start during E2E tests
if (process.env.TEST_ENV === "e2e" || process.env.CI) {
  process.exit(0);
}

// HARD PRODUCTION GUARD - see scripts/simulate.js for the full incident
// note. This wrapper is invoked by `npm run dev:manual` and must never
// run on a production VM. Refuses to start if NODE_ENV=production unless
// an awkward magic-string override is set.
if (process.env.NODE_ENV === "production") {
  const FORCE_OVERRIDE = "yes-i-really-want-to-burn-money-on-prod";
  if (process.env.VMB_FORCE_SIM_IN_PROD !== FORCE_OVERRIDE) {
    console.error(
      "[dev-manual-sim] REFUSING TO RUN: NODE_ENV=production. This script " +
      "starts the local-dev simulator, which creates fake tradesmen and " +
      "fires paid Google Places API calls. It must never run on prod.",
    );
    process.exit(1);
  }
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
//
// If `homeownerProfile` is set, a matching row in the MySQL `users` table will be
// upserted so the account is treated as a registered homeowner without going
// through the signup form on every server restart.
const EMULATOR_USERS = [
  {
    localId: "pLT7RLEYByX6IJWzGAMjAKrW5L93",
    email: "info@elegantbuilding.co.uk",
    password: "o8hSUU8vagHTyuaOY0ov1w==",
    displayName: "Elegant Building Services",
  },
  {
    localId: "chris-morris-homeowner-dev",
    email: "morris27sky@icloud.com",
    password: "password",
    displayName: "Chris Morris",
    homeownerProfile: {
      firstName: "Chris",
      lastName: "Morris",
      username: "chris.morris",
      location: "E4",
    },
  },
  {
    // Local admin account. The matching `user_roles` row (uid → 'admin')
    // is already in MySQL, so we only need to ensure the Firebase emulator
    // user exists with this email/password on every startup.
    localId: "BpSvMxVYpnQeG211hiY8cNPbDCW2",
    email: "admin@example.com",
    password: "password",
    displayName: "Local Admin",
  },
];

async function ensureHomeownerProfiles() {
  const usersWithProfiles = EMULATOR_USERS.filter((u) => u.homeownerProfile);
  if (usersWithProfiles.length === 0) return;

  const mysql2 = require("mysql2/promise");
  const conn = await mysql2.createConnection({
    host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
    database:
      process.env.MYSQL_DATABASE ||
      process.env.TEST_DB_NAME ||
      "vetmybuilder_test_s1_4_w0",
  });

  try {
    for (const user of usersWithProfiles) {
      const p = user.homeownerProfile;
      const outward = (p.location || "").trim().toUpperCase().split(/\s+/)[0] || null;
      await conn.query(
        `INSERT INTO users (uid, email, firstName, lastName, username, locationRaw, postcodeOutward, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           email           = VALUES(email),
           firstName       = VALUES(firstName),
           lastName        = VALUES(lastName),
           username        = VALUES(username),
           locationRaw     = VALUES(locationRaw),
           postcodeOutward = VALUES(postcodeOutward)`,
        [
          user.localId,
          user.email,
          p.firstName,
          p.lastName,
          p.username || null,
          p.location || null,
          outward,
        ],
      );
      log(`Homeowner profile ensured: ${user.email}`);
    }
  } finally {
    await conn.end();
  }
}

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

  // Upsert MySQL profile rows for real homeowner accounts
  try {
    await ensureHomeownerProfiles();
  } catch (e) {
    log(`Warning: failed to ensure homeowner profiles: ${e.message}`);
  }

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

  // Continuously boost any new Elegant recommendations.
  // The daemon creates recs asynchronously on new projects, so we keep polling.
  setInterval(async () => {
    try {
      const mysql2 = require("mysql2/promise");
      const conn = await mysql2.createConnection({
        host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
        port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
        user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
        password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || process.env.TEST_DB_NAME || "vetmybuilder_test_s1_4_w0",
      });
      try {
        // Find Elegant recs that haven't been boosted yet
        const [unboosted] = await conn.query(`
          SELECT r.id, r.projectId FROM recommendations r
          WHERE r.company LIKE '%Elegant%'
            AND r.id NOT IN (
              SELECT DISTINCT CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(userId, '-', 3), '-', -1) AS UNSIGNED)
              FROM recommendation_votes WHERE userId LIKE 'elegant-boost-%'
            )
        `);
        if (unboosted.length === 0) return;

        // Friend source on all Elegant recs
        await conn.query("UPDATE recommendations SET source = 'magic' WHERE company LIKE '%Elegant%'");

        // 15 likes per unboosted rec + CH verification (no hires — test those manually)
        for (const rec of unboosted) {
          for (let v = 0; v < 15; v++) {
            await conn.query(
              "INSERT IGNORE INTO recommendation_votes (recommendationId, userId, value, createdAt, updatedAt) VALUES (?, ?, 1, NOW(), NOW())",
              [rec.id, `elegant-boost-${rec.id}-${v}`]
            ).catch(() => {});
          }

          await conn.query(
            "INSERT IGNORE INTO company_verifications (recommendationId, status, companyNumber, companyName, score, checkedAt) VALUES (?, 'verified', '12758227', 'ELEGANT BUILDING SERVICES LTD', 95, NOW())",
            [rec.id]
          ).catch(() => {});
        }

        log(`Elegant boost: ${unboosted.length} new recs boosted (15 likes + CH verified each)`);
      } finally {
        await conn.end();
      }
    } catch (e) {
      log(`Elegant boost error: ${e.message}`);
    }
  }, 10_000);

  daemon.on("exit", (code) => process.exit(code ?? 0));
})();
