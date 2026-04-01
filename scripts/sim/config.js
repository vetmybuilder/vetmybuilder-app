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
const DAEMON_TIMING = {
  // How often the daemon polls for newly published projects
  pollInterval: 30_000,

  // Delay from project going live → wave 1 starts
  wave1DelayMin: 60_000,   // 1 min
  wave1DelayMax: 120_000,  // 2 min

  // Delay after wave 1 completes → wave 2 starts
  wave2DelayMin: 240_000,  // 4 min
  wave2DelayMax: 480_000,  // 8 min

  // Delay after wave 2 completes → wave 3 starts
  wave3DelayMin: 360_000,  // 6 min
  wave3DelayMax: 720_000,  // 12 min

  // Random pause injected between individual bot actions within each wave
  actionJitterMin: 5_000,  // 5s
  actionJitterMax: 30_000, // 30s

  // Per-builder independent interest-check intervals (index = BOT_UIDS.builders[i])
  // sim-builder-006 (Elegant, idx 5) is most responsive; others arrive progressively later
  builderCheckIntervalMin: [180_000, 240_000, 360_000, 480_000, 600_000,  60_000],
  builderCheckIntervalMax: [300_000, 420_000, 540_000, 720_000, 900_000, 180_000],

  // Delay before the first completed project is seeded (quick start)
  completedProjectFirstDelayMin: 20_000,  // 20s
  completedProjectFirstDelayMax: 40_000,  // 40s

  // Delay between subsequent completed projects
  completedProjectDelayMin: 3 * 60_000,   // 3 min
  completedProjectDelayMax: 8 * 60_000,   // 8 min
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
