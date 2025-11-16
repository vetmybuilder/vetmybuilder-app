#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed a single test project into the existing projects table.
 *
 * Usage:
 *   node server/scripts/seed_test_project.js --db=data/app.db
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// ---------- args & DB ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const DB_PATH = args.db || process.env.DB_FILE || "server/db.sqlite";

// Ensure folder exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

// ---------- sanity: projects table exists? ----------
const hasProjects = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='projects' LIMIT 1`
  )
  .get();

if (!hasProjects) {
  console.error(
    "❌ projects table not found in DB. Start the server once (so migrations run) and then rerun this script."
  );
  process.exit(1);
}

// Optional: log columns so we can see they match
const cols = db.prepare(`PRAGMA table_info(projects)`).all();
console.log("ℹ️ projects columns:", cols.map((c) => c.name).join(", "));

// ---------- test project payload (matches your example) ----------
const project = {
  // id is auto (INTEGER PRIMARY KEY), so we don't set it
  name: "External Wall Insulation in E4 6JH (Detached)",
  type: "External Wall Insulation",
  location: "E4 6JH",
  description:
    "Timeframe: Urgent (1–2 weeks). Budget: Under £5k. Materials: Supplied by tradesman. Access: Parking permit needed, Keys can be provided, Limited access.",
  propertyType: "Detached",
  bedrooms: 1,
  ownerUserId: "BpSvMxVYpnQeG211hiY8cNPbDCW2",
  createdAt: "2025-11-01T23:37:08.682Z",
  status: "live",
  archivedAt: null,
  completedAt: "2025-11-14T20:56:41.136Z",
};

// ---------- insert ----------
const insert = db.prepare(`
  INSERT INTO projects (
    name,
    type,
    location,
    description,
    propertyType,
    bedrooms,
    ownerUserId,
    createdAt,
    status,
    archivedAt,
    completedAt
  ) VALUES (
    @name,
    @type,
    @location,
    @description,
    @propertyType,
    @bedrooms,
    @ownerUserId,
    @createdAt,
    @status,
    @archivedAt,
    @completedAt
  )
`);

const info = insert.run(project);

console.log(`✅ Seeded test project into ${DB_PATH}`);
console.log(`   id: ${info.lastInsertRowid}`);
console.log(`   name: ${project.name}`);
console.log(`   type: ${project.type}`);
console.log(`   location: ${project.location}`);
console.log("   status:", project.status);
