"use strict";

/**
 * Sim daemon — auto-mode bot simulation.
 *
 * When SIM_MODE=auto this daemon:
 *   1. Polls every 30s for newly published (live) projects
 *   2. For each new project, schedules 3 neighbour-recommendation waves
 *      with realistic timing and per-action jitter so the shortlist fills
 *      in gradually rather than all at once
 *   3. Runs each builder on its own independent interest-check schedule
 *      so they appear in the Shared Tradesmen strip at staggered times
 *
 * Typical timeline after a project goes live:
 *   T+1–2 min   : Elegant expresses interest (most responsive builder)
 *   T+1–2 min   : Wave 1 starts — first neighbour recommendations arrive
 *   T+3–5 min   : builder-001 expresses interest
 *   T+4–7 min   : builder-002 expresses interest
 *   T+5–9 min   : Wave 2 — more recommendations + likes on Elegant
 *   T+6–9 min   : builder-003 expresses interest
 *   T+8–12 min  : builder-004 expresses interest
 *   T+11–19 min : Wave 3 — Rachel's recs + final likes
 *   T+10–15 min : builder-005 expresses interest (last to arrive)
 */

const { BOT_UIDS, DAEMON_TIMING, getApiBase } = require("./config");
const { mintToken, apiPost } = require("./api-client");
const { readState, writeState } = require("./state");
const { runWave1, runWave2, runWave3, expressInterest } = require("./run");
const { seedOneCompletedProject, completedProjectFixtureCount } = require("./seed");
const { logger } = require("../../server/lib/logger");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jitter(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  logger.info(`[daemon] ${msg}`);
}

// Builder state keys in recommendationIds — mirrors what run.js uses
const BUILDER_INTEREST_KEY = [
  "interest-builder-001",
  "interest-builder-002",
  "interest-builder-003",
  "interest-builder-004",
  "interest-builder-005",
  "interest-elegant",       // idx 5 = Elegant Building Services (real Firebase UID)
];

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchLiveProjectIds() {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("E2E_TEST_SECRET not set");

  try {
    const res = await fetch(`${getApiBase()}/api/__test__/sim/live-projects`, {
      headers: { "X-Test-Secret": secret },
    });

    if (!res.ok) {
      log(`live-projects route returned ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.items || []).map((p) => String(p.id));
  } catch (e) {
    log(`fetchLiveProjectIds error: ${e.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-project wave simulation
// ---------------------------------------------------------------------------

// Track projects currently being simulated (prevents double-starting)
const inProgress = new Set();

async function simulateProject(projectId) {
  const actionJitter = () =>
    jitter(DAEMON_TIMING.actionJitterMin, DAEMON_TIMING.actionJitterMax);

  const waveOpts = {
    skipDelay: true,         // daemon controls timing externally
    actionJitter,            // inject pauses between individual bot actions
    skipBuilderInterest: true, // builders run on their own independent loops
  };

  // --- Wave 1 ---
  const w1Delay = jitter(DAEMON_TIMING.wave1DelayMin, DAEMON_TIMING.wave1DelayMax);
  log(`Project ${projectId}: wave 1 in ${Math.round(w1Delay / 1000)}s`);
  await sleep(w1Delay);

  let state = readState();
  if (!state.projects?.[projectId]?.wavesCompleted?.includes(1)) {
    await runWave1(projectId, state, false, waveOpts);
  } else {
    log(`Project ${projectId}: wave 1 already complete - skipping`);
  }

  // --- Wave 2 ---
  const w2Delay = jitter(DAEMON_TIMING.wave2DelayMin, DAEMON_TIMING.wave2DelayMax);
  log(`Project ${projectId}: wave 2 in ${Math.round(w2Delay / 1000)}s`);
  await sleep(w2Delay);

  state = readState();
  if (!state.projects?.[projectId]?.wavesCompleted?.includes(2)) {
    await runWave2(projectId, state, false, waveOpts);
  } else {
    log(`Project ${projectId}: wave 2 already complete - skipping`);
  }

  // --- Wave 3 ---
  const w3Delay = jitter(DAEMON_TIMING.wave3DelayMin, DAEMON_TIMING.wave3DelayMax);
  log(`Project ${projectId}: wave 3 in ${Math.round(w3Delay / 1000)}s`);
  await sleep(w3Delay);

  state = readState();
  if (!state.projects?.[projectId]?.wavesCompleted?.includes(3)) {
    await runWave3(projectId, state, false, waveOpts);
  } else {
    log(`Project ${projectId}: wave 3 already complete - skipping`);
  }

  log(`Project ${projectId}: all waves complete`);
}

// ---------------------------------------------------------------------------
// Per-builder independent interest-check loops
// ---------------------------------------------------------------------------

async function runBuilderLoop(builderIdx) {
  const uid = BOT_UIDS.builders[builderIdx];
  const interestKey = BUILDER_INTEREST_KEY[builderIdx];

  while (true) {
    // Each builder wakes on its own schedule
    await sleep(
      jitter(
        DAEMON_TIMING.builderCheckIntervalMin[builderIdx],
        DAEMON_TIMING.builderCheckIntervalMax[builderIdx],
      ),
    );

    try {
      const liveIds = await fetchLiveProjectIds();
      if (!liveIds.length) continue;

      const state = readState();

      for (const projectId of liveIds) {
        const ps = state.projects?.[projectId];

        // Already expressed interest — nothing to do
        if (ps?.recommendationIds?.[interestKey]) continue;

        log(`${uid} expressing interest in project ${projectId}`);
        const shareId = await expressInterest(projectId, builderIdx);

        // Persist to state so we don't re-send on the next check
        const fresh = readState();
        if (!fresh.projects[projectId]) {
          fresh.projects[projectId] = {
            wavesCompleted: [],
            recommendationIds: {},
            startedAt: new Date().toISOString(),
          };
        }
        fresh.projects[projectId].recommendationIds[interestKey] = shareId;
        writeState(fresh);
      }
    } catch (e) {
      log(`Builder ${uid} check error: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Completed projects drip-feed loop
// ---------------------------------------------------------------------------

async function completedProjectsLoop() {
  let isFirst = true;

  while (true) {
    const state = readState();
    const seededCount = state.completedProjectsSeedCount || 0;

    if (seededCount >= completedProjectFixtureCount) {
      log("All completed projects seeded - completed projects loop done");
      return;
    }

    const delay = isFirst
      ? jitter(DAEMON_TIMING.completedProjectFirstDelayMin, DAEMON_TIMING.completedProjectFirstDelayMax)
      : jitter(DAEMON_TIMING.completedProjectDelayMin, DAEMON_TIMING.completedProjectDelayMax);
    isFirst = false;

    log(
      `Completed project ${seededCount + 1}/${completedProjectFixtureCount} will be seeded in ${Math.round(delay / 1000)}s`,
    );
    await sleep(delay);

    try {
      const fresh = readState();
      const currentCount = fresh.completedProjectsSeedCount || 0;
      if (currentCount >= completedProjectFixtureCount) return;

      await seedOneCompletedProject(currentCount, fresh);
      log(`Completed project ${currentCount + 1}/${completedProjectFixtureCount} seeded`);
    } catch (e) {
      log(`Completed project seed error: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Project-discovery poll loop
// ---------------------------------------------------------------------------

async function poll() {
  const state = readState();

  if (!state.seeded) {
    log("Bot pool not seeded yet - skipping poll (run `simulate.js seed` first)");
    return;
  }

  const liveIds = await fetchLiveProjectIds();

  for (const id of liveIds) {
    const ps = state.projects?.[id];
    const allDone =
      ps?.wavesCompleted?.includes(1) &&
      ps?.wavesCompleted?.includes(2) &&
      ps?.wavesCompleted?.includes(3);

    if (allDone || inProgress.has(id)) continue;

    // Register the project in state before kicking off async simulation
    // so re-entrant polls don't double-start it
    const fresh = readState();
    if (!fresh.projects) fresh.projects = {};
    if (!fresh.projects[id]) {
      fresh.projects[id] = {
        wavesCompleted: [],
        recommendationIds: {},
        startedAt: new Date().toISOString(),
      };
      writeState(fresh);
    }

    inProgress.add(id);
    log(`New live project detected: ${id} - scheduling waves`);

    simulateProject(id)
      .catch((e) => log(`simulateProject(${id}) error: ${e.message}`))
      .finally(() => inProgress.delete(id));
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function startDaemon() {
  log("Sim daemon starting (SIM_MODE=auto)");
  log(
    `Poll interval: ${DAEMON_TIMING.pollInterval / 1000}s | ` +
      `Wave 1: ${DAEMON_TIMING.wave1DelayMin / 1000}-${DAEMON_TIMING.wave1DelayMax / 1000}s after live | ` +
      `Action jitter: ${DAEMON_TIMING.actionJitterMin / 1000}-${DAEMON_TIMING.actionJitterMax / 1000}s`,
  );

  // Run an immediate poll so projects published before the daemon started are picked up
  await poll().catch((e) => log(`Initial poll error: ${e.message}`));

  // Recurring project-discovery poll
  setInterval(() => {
    poll().catch((e) => log(`Poll error: ${e.message}`));
  }, DAEMON_TIMING.pollInterval);

  // Start each builder's independent interest-check loop
  for (let i = 0; i < BOT_UIDS.builders.length; i++) {
    const uid = BOT_UIDS.builders[i];
    const minS = DAEMON_TIMING.builderCheckIntervalMin[i] / 1000;
    const maxS = DAEMON_TIMING.builderCheckIntervalMax[i] / 1000;
    log(`${uid} check interval: ${minS}-${maxS}s`);
    runBuilderLoop(i).catch((e) => log(`Builder loop ${uid} crashed: ${e.message}`));
  }

  // Drip-feed completed community projects one at a time
  const seededSoFar = readState().completedProjectsSeedCount || 0;
  if (seededSoFar < completedProjectFixtureCount) {
    log(
      `Completed projects: ${seededSoFar}/${completedProjectFixtureCount} seeded - drip-feed loop starting`,
    );
    completedProjectsLoop().catch((e) =>
      log(`Completed projects loop error: ${e.message}`),
    );
  } else {
    log(`Completed projects: all ${completedProjectFixtureCount} already seeded`);
  }

  log("Daemon running. Ctrl+C to stop.");

  // Keep the process alive
  process.on("SIGINT", () => {
    log("Daemon stopping (SIGINT)");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    log("Daemon stopping (SIGTERM)");
    process.exit(0);
  });
}

module.exports = { startDaemon };
