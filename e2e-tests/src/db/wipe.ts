// e2e-tests/src/db/wipe.ts
import { connect } from "./mysql";

const KEEP_TABLES = new Set(["users", "user_roles", "roles"]);

export async function wipeDatabase(dbName: string) {
  const conn = await connect({
    host: process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.TEST_DB_PORT || 3306),
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: dbName,
  });

  const [rows] = await conn.query<any[]>(
    `
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = ?
      AND table_type = 'BASE TABLE'
    `,
    [dbName]
  );

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const r of rows) {
    const name = r?.name;
    if (!name) continue;

    const table = String(name);
    if (KEEP_TABLES.has(table)) continue;

    await conn.query(`TRUNCATE TABLE \`${table}\``);
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  await conn.end();
}
