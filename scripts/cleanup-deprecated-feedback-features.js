#!/usr/bin/env node
//
// Strips deprecated feature values (`hiring`, `comparing`, `voting`) from the
// `feedback.features_used` CSV column. Those features no longer exist in the
// product, so leaving them in historical rows is just noise.
//
// Usage:
//   node scripts/cleanup-deprecated-feedback-features.js          # dry run
//   node scripts/cleanup-deprecated-feedback-features.js --apply  # commit
//
// MYSQL_HOST / PORT / USER / PASSWORD / DATABASE come from .env or the shell.

require("dotenv").config();
const mysql = require("mysql2/promise");

const DEPRECATED = new Set(["hiring", "comparing", "voting"]);
const APPLY = process.argv.includes("--apply");

function cleanCsv(csv) {
  if (!csv) return null;
  const kept = csv
    .split(",")
    .map((s) => s.trim())
    .filter((v) => v && !DEPRECATED.has(v));
  return kept.length > 0 ? kept.join(",") : null;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const [rows] = await conn.execute(
    `SELECT id, features_used FROM feedback WHERE features_used IS NOT NULL`,
  );

  let touched = 0;
  let cleared = 0;
  for (const row of rows) {
    const before = row.features_used;
    const after = cleanCsv(before);
    if (after === before) continue;

    touched++;
    if (after === null) cleared++;

    console.log(
      `${APPLY ? "UPDATE" : "DRY"} id=${row.id}  "${before}"  →  ${after === null ? "NULL" : `"${after}"`}`,
    );

    if (APPLY) {
      await conn.execute(
        `UPDATE feedback SET features_used = ? WHERE id = ?`,
        [after, row.id],
      );
    }
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"} ${touched} row(s). ${cleared} would clear to NULL. Total scanned: ${rows.length}.`,
  );
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
