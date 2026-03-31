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

module.exports = { BOT_UIDS, ALL_BOT_UIDS, TIMING, FAST_TIMING, getApiBase, getAdminUid };
