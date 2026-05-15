#!/usr/bin/env node
// scripts/staging-sim.js
//
// Staging equivalent of dev-manual-sim.js.
// Runs seed + daemon + Elegant boost, using SIM_PROD=1 (X-Sim-Uid auth bypass)
// and SIM_FAST=1 (local-speed timing).
// No Firebase emulator needed.

const { spawn } = require("child_process");
const mysql2 = require("mysql2/promise");
const { logger } = require("../server/lib/logger");

const log = (msg) => logger.info(`[staging-sim] ${msg}`);

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "vetmybuilder_staging",
};

async function waitForServer() {
  const base = process.env.API_BASE_URL || "http://localhost:8788";
  // Wait for API health
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Wait for DB schema to be fully applied (check a late table)
  for (let i = 0; i < 30; i++) {
    try {
      const conn = await mysql2.createConnection(DB_CONFIG);
      const [rows] = await conn.query("SHOW TABLES LIKE 'hires'");
      await conn.end();
      if (rows.length > 0) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function ensureHomeownerProfiles() {
  const conn = await mysql2.createConnection(DB_CONFIG);
  try {
    // Ensure the logged-in user has a profile row
    const [users] = await conn.query(
      "SELECT uid FROM users WHERE firstName IS NOT NULL AND uid NOT LIKE 'staging-%' AND uid NOT LIKE 'sim-%'"
    );
    log(`Found ${users.length} real user(s) with profiles`);
  } finally {
    await conn.end();
  }
}

function runScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/simulate.js", script], {
      stdio: "inherit",
      env: { ...process.env },
    });
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
    log("Server did not become ready — exiting");
    process.exit(1);
  }

  // Ensure homeowner profiles
  try {
    await ensureHomeownerProfiles();
  } catch (e) {
    log(`Warning: homeowner profiles check failed: ${e.message}`);
  }

  // Run sim seed FIRST (creates completed projects, tradesmen via API)
  log("Running sim seed...");
  try {
    await runScript("seed");
  } catch (e) {
    log(`Sim seed warning (non-fatal): ${e.message}`);
  }

  // Run staging seed AFTER sim seed (fixes photo URLs, adds pipeline entries)
  log("Running staging seed...");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("node", ["scripts/staging-seed.js"], {
        stdio: "inherit",
        env: { ...process.env },
      });
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`staging-seed.js exited with code ${code}`));
      });
    });
  } catch (e) {
    log(`Staging seed warning: ${e.message}`);
  }

  log("Seed complete. Starting daemon...");
  const daemon = spawn("node", ["scripts/simulate.js", "daemon"], {
    stdio: "inherit",
    env: { ...process.env, SIM_MODE: "auto" },
  });

  // Continuously boost Elegant recommendations (same as dev-manual-sim.js)
  setInterval(async () => {
    try {
      const conn = await mysql2.createConnection(DB_CONFIG);
      try {
        const [unboosted] = await conn.query(`
          SELECT r.id, r.projectId FROM recommendations r
          WHERE r.company LIKE '%Elegant%'
            AND r.id NOT IN (
              SELECT DISTINCT CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(userId, '-', 3), '-', -1) AS UNSIGNED)
              FROM recommendation_votes WHERE userId LIKE 'elegant-boost-%'
            )
        `);
        if (unboosted.length === 0) return;

        // Friend source on Elegant community recs (preserve pipeline recs)
        await conn.query(
          "UPDATE recommendations SET source = 'magic' WHERE company LIKE '%Elegant%' AND source != 'pipeline'"
        );

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
