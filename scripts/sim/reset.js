"use strict";

const { ALL_BOT_UIDS } = require("./config");
const { deleteSimData } = require("./db");
const { readState, deleteState } = require("./state");
const { logger } = require("../../server/lib/logger");

async function deleteFirebaseUsers() {
  const admin = require("firebase-admin");

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "vetmybuilder-test",
    });
  }

  for (const uid of ALL_BOT_UIDS) {
    try {
      await admin.auth().deleteUser(uid);
      logger.info(`[reset] Deleted Firebase user ${uid}`);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        logger.info(`[reset] ${uid} not in Firebase (skipping)`);
      } else {
        throw err;
      }
    }
  }
}

async function reset() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot run simulation reset in production");
  }

  logger.info("[reset] Starting teardown of all simulation data...");

  // Collect all recommendation IDs tracked across all projects
  const state = readState();
  const allRecIds = [];
  for (const ps of Object.values(state.projects || {})) {
    for (const recId of Object.values(ps.recommendationIds || {})) {
      if (recId && !allRecIds.includes(Number(recId))) {
        allRecIds.push(Number(recId));
      }
    }
  }

  // Step 1 - targeted DB cleanup (always runs, no emulator needed)
  logger.info("[reset] Deleting sim records from database...");
  try {
    await deleteSimData(allRecIds);
    logger.info("[reset] Database records deleted");
  } catch (err) {
    logger.warn({ err: err?.message || err }, "[reset] DB cleanup error (continuing)");
  }

  // Step 2 - Firebase auth user deletion
  // Only attempted when the emulator is configured. Emulator users are
  // ephemeral - if the emulator is not running they are already gone.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    logger.info("[reset] Deleting Firebase auth users...");
    try {
      await deleteFirebaseUsers();
    } catch (err) {
      logger.warn({ err: err?.message || err }, "[reset] Firebase cleanup error (continuing)");
    }
  } else {
    logger.info("[reset] FIREBASE_AUTH_EMULATOR_HOST not set - skipping Firebase user deletion");
    logger.info("[reset] (emulator users are ephemeral and will not persist across restarts)");
  }

  // Step 3 - delete state file
  logger.info("[reset] Deleting state file...");
  deleteState();
  logger.info("[reset] .sim-state.json deleted");

  logger.info("[reset] Done. Run `node scripts/simulate.js seed` to start fresh.");
}

module.exports = { reset };
