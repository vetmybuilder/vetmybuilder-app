#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

// =========================================================================
// HARD PRODUCTION GUARD
// =========================================================================
// April 2026: this script ran on production for ~10 days under PM2 as
// `sim-daemon`, generating ~£100 of Google Places API spend by repeatedly
// creating fake tradesmen and triggering the enrichment pipeline. Without
// this guard, anyone who sets SIM_PROD=1 (or installs the script under
// PM2 with `pm2 startup`) can do it again. Refuse to run on prod under
// almost any circumstance.
//
// To override (you almost certainly should not):
//   1. NODE_ENV must not be 'production'                          OR
//   2. VMB_FORCE_SIM_IN_PROD must equal the magic string below
// The magic string is intentionally awkward to type so it can't be set
// by mistake and is impossible to confuse with a normal config value.
// =========================================================================
const FORCE_OVERRIDE = "yes-i-really-want-to-burn-money-on-prod";

if (process.env.NODE_ENV === "production") {
  if (process.env.VMB_FORCE_SIM_IN_PROD !== FORCE_OVERRIDE) {
    console.error(
      "[simulate] REFUSING TO RUN: NODE_ENV=production. The simulator " +
      "creates fake tradesmen and triggers paid Google Places API calls " +
      "for each. If you genuinely need this on prod, set " +
      `VMB_FORCE_SIM_IN_PROD=${FORCE_OVERRIDE} (you almost certainly do not).`,
    );
    process.exit(1);
  }
  console.warn(
    "[simulate] WARNING: running on NODE_ENV=production with override " +
    "VMB_FORCE_SIM_IN_PROD set. This will create real database rows and " +
    "fire real billable Google Places API calls. You have ~10 seconds to " +
    "Ctrl+C if this was a mistake.",
  );
  // Pause so a fat-fingered prod run is interruptible.
  // eslint-disable-next-line no-undef
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
}

const SIM_PROD = process.env.SIM_PROD === "1";

if (!SIM_PROD) {
  // Local dev: Firebase emulator host is set inline by npm run dev:manual,
  // not in .env. Default to the standard local port so the script works standalone.
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  }

  // dev:manual runs the API on port 3100, but NEXT_PUBLIC_API_BASE in .env
  // points to 8787 (regular dev). Override to target the dev:manual server.
  // Set SIM_API_BASE in your environment to use a different port.
  process.env.NEXT_PUBLIC_API_BASE =
    process.env.SIM_API_BASE || "http://localhost:3100";
}
// In SIM_PROD=1 mode, API base and auth are taken directly from .env (no overrides).

const args = process.argv.slice(2);
const command = args[0];
const projectId = (args.find((a) => a.startsWith("--project-id=")) || "").replace("--project-id=", "");
const fast = args.includes("--fast");

function usage() {
  console.log(`
Usage:
  node scripts/simulate.js seed                              Seed builder and neighbour bot pool (idempotent)
  node scripts/simulate.js run --project-id=<id> [--fast]   Run simulation waves against a published project (manual)
  node scripts/simulate.js daemon                            Start the auto-simulation daemon (requires SIM_MODE=auto)
  node scripts/simulate.js reset                             Delete all sim data and state

Options:
  --fast    Collapse wave delays to seconds (for quick local feedback)

Modes:
  SIM_MODE=auto   Daemon watches for published projects and runs bots automatically
  (not set)       Manual mode — use seed / run / reset commands yourself
`);
}

async function main() {
  switch (command) {
    case "seed": {
      const { seed } = require("./sim/seed");
      await seed();
      break;
    }

    case "run": {
      if (!projectId) {
        console.error("Error: --project-id=<id> is required\n");
        usage();
        process.exit(1);
      }
      const { run } = require("./sim/run");
      await run(projectId, fast);
      break;
    }

    case "daemon": {
      const simMode = process.env.SIM_MODE;
      if (simMode !== "auto") {
        console.error("Error: SIM_MODE=auto must be set to use daemon mode.");
        console.error("Add SIM_MODE=auto to your .env file, then re-run.\n");
        usage();
        process.exit(1);
      }
      const { startDaemon } = require("./sim/daemon");
      await startDaemon();
      // startDaemon keeps the process alive — execution never reaches here
      break;
    }

    case "reset": {
      const { reset } = require("./sim/reset");
      await reset();
      break;
    }

    default: {
      if (command) console.error(`Unknown command: ${command}\n`);
      usage();
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((err) => {
  console.error(`\n[simulate] Error: ${err.message}\n`);
  process.exit(1);
});
