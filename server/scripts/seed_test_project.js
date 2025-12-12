#!/usr/bin/env node
/**
 * Seed a single test project into the MySQL `projects` table.
 */

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

const mysql = require("mysql2/promise");
const { logger } = require("../lib/logger"); // unified logger

const TAG = "[seed_test_project]";

// ---------- MySQL config ----------
const {
  MYSQL_HOST = "127.0.0.1",
  MYSQL_PORT = "3306",
  MYSQL_USER = "root",
  MYSQL_PASSWORD = "",
  MYSQL_DATABASE = "vetmybuilder",
} = process.env;

async function main() {
  logger.info(
    {
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      database: MYSQL_DATABASE,
    },
    `${TAG} connecting to MySQL`
  );

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
      logger.error(
        `${TAG} projects table not found — ensure MySQL schema has been applied`
      );
      process.exit(1);
    }

    // Optional: show existing columns
    const [cols] = await conn.execute("SHOW COLUMNS FROM projects");
    logger.info(
      { columns: cols.map((c) => c.Field) },
      `${TAG} projects table columns`
    );

    // ---------- sample test project (privacy-safe location) ----------
    const project = {
      name: "External Wall Insulation in E4 (Detached)",
      type: "External Wall Insulation",

      // ❌ OLD: "E4 6JH"
      // ✅ NEW: outward code only (privacy-safe)
      location: "E4",

      description:
        "Timeframe: Urgent (1–2 weeks). Budget: Under £5k. Materials: Supplied by tradesman. Access: Parking permit needed, Keys can be provided, Limited access.",
      propertyType: "Detached",
      bedrooms: 1,
      ownerUserId: "BpSvMxVYpnQeG211hiY8cNPbDCW2",
      createdAt: new Date("2025-11-01T23:37:08.682Z"),
      status: "live",
      archivedAt: null,
      completedAt: new Date("2025-11-14T20:56:41.136Z"),
    };

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

    logger.info(
      {
        insertedId: result.insertId,
        name: project.name,
        type: project.type,
        location: project.location,
        status: project.status,
      },
      `${TAG} test project seeded successfully`
    );
  } catch (err) {
    logger.error({ error: err?.message }, `${TAG} failed to seed test project`);
    process.exit(1);
  } finally {
    await conn.end();
    logger.info(`${TAG} connection closed`);
  }
}

main();
