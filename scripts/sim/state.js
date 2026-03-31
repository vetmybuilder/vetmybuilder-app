"use strict";

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(__dirname, "../../.sim-state.json");

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { seeded: false, projects: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { seeded: false, projects: {} };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function deleteState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

module.exports = { readState, writeState, deleteState };
