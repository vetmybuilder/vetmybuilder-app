"use strict";

const BOT_UIDS = {
  builders: [
    "sim-builder-001",
    "sim-builder-002",
    "sim-builder-003",
    "sim-builder-004",
    "sim-builder-005",
    "sim-builder-006",
  ],
  neighbours: [
    "sim-neighbour-001",
    "sim-neighbour-002",
    "sim-neighbour-003",
  ],
};

// All bot UIDs as a flat list — used by reset
const ALL_BOT_UIDS = [...BOT_UIDS.builders, ...BOT_UIDS.neighbours];

// Wave delays in milliseconds
const TIMING = {
  wave1: 0,
  wave2: 90_000,
  wave3: 180_000,
};

const FAST_TIMING = {
  wave1: 0,
  wave2: 2_000,
  wave3: 4_000,
};

// Daemon timing — all values in milliseconds
// SIM_PROD=1 uses realistic production delays; local uses fast defaults for testing
const _prod = process.env.SIM_PROD === "1";

const DAEMON_TIMING = {
  // How often the daemon polls for newly published projects
  pollInterval: _prod ? 30_000 : 10_000,

  // Delay from project going live → wave 1 starts
  wave1DelayMin: _prod ? 60_000  :  5_000,
  wave1DelayMax: _prod ? 120_000 : 15_000,

  // Delay after wave 1 completes → wave 2 starts
  wave2DelayMin: _prod ? 240_000 : 30_000,
  wave2DelayMax: _prod ? 480_000 : 60_000,

  // Delay after wave 2 completes → wave 3 starts
  wave3DelayMin: _prod ? 360_000 :  60_000,
  wave3DelayMax: _prod ? 720_000 : 120_000,

  // Random pause injected between individual bot actions within each wave
  actionJitterMin: _prod ? 5_000 : 1_000,
  actionJitterMax: _prod ? 30_000 : 5_000,

  // Per-builder independent interest-check intervals (index = BOT_UIDS.builders[i])
  // sim-builder-006 (Elegant, idx 5) is most responsive; others arrive progressively later
  builderCheckIntervalMin: _prod
    ? [180_000, 240_000, 360_000, 480_000, 600_000,  60_000]
    : [ 30_000,  45_000,  60_000,  75_000,  90_000,  10_000],
  builderCheckIntervalMax: _prod
    ? [300_000, 420_000, 540_000, 720_000, 900_000, 180_000]
    : [ 60_000,  75_000,  90_000, 120_000, 150_000,  20_000],

  // Delay before the first completed project is seeded (quick start)
  completedProjectFirstDelayMin: _prod ? 20_000 :  5_000,
  completedProjectFirstDelayMax: _prod ? 40_000 : 10_000,

  // Delay between subsequent completed projects
  completedProjectDelayMin: _prod ? 3 * 60_000 : 30_000,
  completedProjectDelayMax: _prod ? 8 * 60_000 : 60_000,
};

function getApiBase() {
  return (
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.API_BASE_URL ||
    "http://localhost:8787"
  );
}

function getAdminUid() {
  return process.env.TEST_ADMIN_USER_UID || null;
}

module.exports = { BOT_UIDS, ALL_BOT_UIDS, TIMING, FAST_TIMING, DAEMON_TIMING, getApiBase, getAdminUid };
