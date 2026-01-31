require("dotenv").config({ path: ".env.e2e.local" });

const db = process.env.VMB_E2E_DB;
if (!db) {
  console.error("[VMB] VMB_E2E_DB not set in .env.e2e.local");
  process.exit(1);
}

async function main() {
  const { query } = require("../server/lib/mysql");

  console.log(`[VMB] wiping database: ${db}`);

  // Drop + recreate DB
  await query(`DROP DATABASE IF EXISTS \`${db}\``);
  await query(`CREATE DATABASE \`${db}\``);

  console.log(`[VMB] done`);
}

main().catch((err) => {
  console.error("[VMB] clean failed:", err?.message || err);
  process.exit(1);
});
