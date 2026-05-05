#!/usr/bin/env node
//
// Backfills `project_classifications` rows for projects that don't have one
// (or whose latest classification has a null `price_band_estimate`). The AI
// classifier normally runs inline on POST /api/projects, but raw-SQL seeds
// bypass that path, leaving the homeowner /projects card and the tradesman
// swipe deck without a price band to show.
//
// Usage:
//   node scripts/backfill-project-classifications.js
//
// MySQL creds come from .env (MYSQL_HOST / PORT / USER / PASSWORD / DATABASE).

require("dotenv").config();
const mysql = require("mysql2/promise");
const { classifyProject } = require("../server/lib/ai/projectClassifier");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const mysqlQuery = async (sql, params = []) => {
    const [rows] = await conn.execute(sql, params);
    return rows;
  };

  // Find projects whose latest classification (if any) lacks a price band.
  const candidates = await mysqlQuery(
    `SELECT p.id, p.name, p.type, p.location, p.description,
            p.propertyType, p.bedrooms, p.answers_json
       FROM projects p
       LEFT JOIN project_classifications pc
         ON pc.id = (SELECT MAX(id)
                       FROM project_classifications
                      WHERE project_id = p.id)
      WHERE pc.id IS NULL
         OR JSON_UNQUOTE(JSON_EXTRACT(pc.structured, '$.price_band_estimate'))
            IS NULL`,
  );

  if (candidates.length === 0) {
    console.log("All projects already have a price-banded classification.");
    await conn.end();
    return;
  }

  console.log(`Backfilling ${candidates.length} project(s)…`);

  let ok = 0;
  let skipped = 0;
  for (const row of candidates) {
    let answers = null;
    if (row.answers_json) {
      try {
        answers =
          typeof row.answers_json === "string"
            ? JSON.parse(row.answers_json)
            : row.answers_json;
      } catch {
        answers = null;
      }
    }

    process.stdout.write(`  #${row.id} "${row.name}" … `);
    const result = await classifyProject({
      mysqlQuery,
      projectId: row.id,
      description: row.description,
      type: row.type,
      location: row.location,
      propertyType: row.propertyType,
      bedrooms: row.bedrooms,
      answers,
    });

    if (result?.price_band_estimate) {
      ok++;
      console.log(result.price_band_estimate);
    } else if (result) {
      skipped++;
      console.log("classified, no price band");
    } else {
      skipped++;
      console.log("classifier returned null");
    }
  }

  console.log(
    `\nDone. ${ok} with price band, ${skipped} without. Total: ${candidates.length}.`,
  );
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
