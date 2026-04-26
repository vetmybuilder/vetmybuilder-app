#!/usr/bin/env node
// Backfill linked_tradesman_uid on existing recommendations whose company
// name matches an active tradesman. Same matching rules as
// matchAndNotifyTradesman (suffix-stripped, alphanumeric-only, lowercase).
//
// Usage:
//   node scripts/backfill-recommendation-tradesman-links.js [--apply]
//
// Without --apply this is a dry run that prints what would change.

require("dotenv").config();
const mysql = require("mysql2/promise");
const {
  normaliseCompanyName,
} = require("../server/lib/matchRecommendationToTradesman");

const APPLY = process.argv.includes("--apply");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const [tradesmen] = await conn.execute(
    `SELECT user_id, company_name FROM tradesmen WHERE status = 'active'`
  );
  const byNorm = new Map();
  for (const t of tradesmen) {
    const k = normaliseCompanyName(t.company_name);
    if (!k) continue;
    if (byNorm.has(k)) continue;
    byNorm.set(k, t.user_id);
  }

  const [recs] = await conn.execute(
    `SELECT id, projectId, company FROM recommendations WHERE linked_tradesman_uid IS NULL`
  );

  let matched = 0;
  let skipped = 0;
  for (const r of recs) {
    const k = normaliseCompanyName(r.company);
    const uid = k ? byNorm.get(k) : null;
    if (!uid) {
      skipped++;
      continue;
    }
    matched++;
    console.log(
      `${APPLY ? "LINK" : "DRY"} rec ${r.id} (project ${r.projectId}, "${r.company}") -> ${uid}`
    );
    if (APPLY) {
      await conn.execute(
        `UPDATE recommendations SET linked_tradesman_uid = ? WHERE id = ? AND linked_tradesman_uid IS NULL`,
        [uid, r.id]
      );
    }
  }

  console.log(
    `\n${APPLY ? "Applied" : "Would link"}: ${matched}. No-match (off-platform): ${skipped}.`
  );
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
