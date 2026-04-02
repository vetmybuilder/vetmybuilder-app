#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

// Firebase emulator host is set inline by npm run dev:manual, not in .env.
// Default to the standard local port so the script works standalone.
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
