#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed a single test project into the MySQL `projects` table.
 *
 * Usage (example):
 *
 *   MYSQL_HOST=127.0.0.1 \
 *   MYSQL_USER=root \
 *   MYSQL_PASSWORD=your_password \
 *   MYSQL_DATABASE=vetmybuilder \
 *   node server/scripts/seed_test_project.js
 */
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

const mysql = require("mysql2/promise");

// ---------- MySQL config ----------
const {
  MYSQL_HOST = "127.0.0.1",
  MYSQL_PORT = "3306",
  MYSQL_USER = "root",
  MYSQL_PASSWORD = "",
  MYSQL_DATABASE = "vetmybuilder",
} = process.env;

async function main() {
  console.log("🔌 Connecting to MySQL...");
  const conn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  });

  try {
    // ---------- sanity: projects table exists? ----------
    const [tables] = await conn.execute("SHOW TABLES LIKE 'projects'");

    if (!tables || tables.length === 0) {
      console.error(
        "❌ projects table not found in MySQL. Make sure migrations have run (mysql_schema.sql imported)."
      );
      process.exit(1);
    }

    // Optional: log columns so we can see they match
    const [cols] = await conn.execute("SHOW COLUMNS FROM projects");
    console.log("ℹ️ projects columns:", cols.map((c) => c.Field).join(", "));

    // ---------- test project payload (matches your example) ----------
    const project = {
      name: "External Wall Insulation in E4 6JH (Detached)",
      type: "External Wall Insulation",
      location: "E4 6JH",
      description:
        "Timeframe: Urgent (1–2 weeks). Budget: Under £5k. Materials: Supplied by tradesman. Access: Parking permit needed, Keys can be provided, Limited access.",
      propertyType: "Detached",
      bedrooms: 1,
      ownerUserId: "BpSvMxVYpnQeG211hiY8cNPbDCW2",
      // Use JS Date objects so mysql2 formats them correctly
      createdAt: new Date("2025-11-01T23:37:08.682Z"),
      status: "live",
      archivedAt: null,
      completedAt: new Date("2025-11-14T20:56:41.136Z"),
    };

    // ---------- insert into MySQL ----------
    const [result] = await conn.execute(
      `
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        project.name,
        project.type,
        project.location,
        project.description,
        project.propertyType,
        project.bedrooms,
        project.ownerUserId,
        project.createdAt,
        project.status,
        project.archivedAt,
        project.completedAt,
      ]
    );

    console.log(
      `✅ Seeded test project into MySQL database "${MYSQL_DATABASE}"`
    );
    console.log(`   id: ${result.insertId}`);
    console.log(`   name: ${project.name}`);
    console.log(`   type: ${project.type}`);
    console.log(`   location: ${project.location}`);
    console.log("   status:", project.status);
  } catch (err) {
    console.error("❌ Error seeding test project:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

// #!/usr/bin/env node
// /* eslint-disable no-console */
// /**
//  * Seed a single test project into the existing projects table.
//  *
//  * Usage:
//  *   node server/scripts/seed_test_project.js --db=data/app.db
//  */

// const path = require("path");
// const fs = require("fs");
// const Database = require("better-sqlite3");

// // ---------- args & DB ----------
// const args = Object.fromEntries(
//   process.argv.slice(2).map((a) => {
//     const [k, v] = a.replace(/^--/, "").split("=");
//     return [k, v ?? true];
//   })
// );

// const DB_PATH = args.db || process.env.DB_FILE || "server/db.sqlite";

// // Ensure folder exists
// if (!fs.existsSync(path.dirname(DB_PATH))) {
//   fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
// }

// const db = new Database(DB_PATH);

// // ---------- sanity: projects table exists? ----------
// const hasProjects = db
//   .prepare(
//     `SELECT name FROM sqlite_master WHERE type='table' AND name='projects' LIMIT 1`
//   )
//   .get();

// if (!hasProjects) {
//   console.error(
//     "❌ projects table not found in DB. Start the server once (so migrations run) and then rerun this script."
//   );
//   process.exit(1);
// }

// // Optional: log columns so we can see they match
// const cols = db.prepare(`PRAGMA table_info(projects)`).all();
// console.log("ℹ️ projects columns:", cols.map((c) => c.name).join(", "));

// // ---------- test project payload (matches your example) ----------
// const project = {
//   // id is auto (INTEGER PRIMARY KEY), so we don't set it
//   name: "External Wall Insulation in E4 6JH (Detached)",
//   type: "External Wall Insulation",
//   location: "E4 6JH",
//   description:
//     "Timeframe: Urgent (1–2 weeks). Budget: Under £5k. Materials: Supplied by tradesman. Access: Parking permit needed, Keys can be provided, Limited access.",
//   propertyType: "Detached",
//   bedrooms: 1,
//   ownerUserId: "BpSvMxVYpnQeG211hiY8cNPbDCW2",
//   createdAt: "2025-11-01T23:37:08.682Z",
//   status: "live",
//   archivedAt: null,
//   completedAt: "2025-11-14T20:56:41.136Z",
// };

// // ---------- insert ----------
// const insert = db.prepare(`
//   INSERT INTO projects (
//     name,
//     type,
//     location,
//     description,
//     propertyType,
//     bedrooms,
//     ownerUserId,
//     createdAt,
//     status,
//     archivedAt,
//     completedAt
//   ) VALUES (
//     @name,
//     @type,
//     @location,
//     @description,
//     @propertyType,
//     @bedrooms,
//     @ownerUserId,
//     @createdAt,
//     @status,
//     @archivedAt,
//     @completedAt
//   )
// `);

// const info = insert.run(project);

// console.log(`✅ Seeded test project into ${DB_PATH}`);
// console.log(`   id: ${info.lastInsertRowid}`);
// console.log(`   name: ${project.name}`);
// console.log(`   type: ${project.type}`);
// console.log(`   location: ${project.location}`);
// console.log("   status:", project.status);
