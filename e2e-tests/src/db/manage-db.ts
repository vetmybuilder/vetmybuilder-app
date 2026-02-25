// e2e-tests/src/db/manage-db.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { connect } from "./mysql";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for ${name}: ${raw}`);
  }
  return n;
}

function repoRoot(): string {
  // manage-db.ts is at e2e-tests/src/db/manage-db.ts
  return path.resolve(__dirname, "..", "..", "..");
}

function readSqlFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQL file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function assertTestDb(dbName: string) {
  if (!dbName.includes("test")) {
    throw new Error(`Refusing to touch non-test DB: ${dbName}`);
  }
}

type Queryable = {
  query: (sql: string, params?: any[]) => Promise<any>;
};

export async function ensureDatabase(dbName: string) {
  assertTestDb(dbName);

  const conn = await connect({
    host: env("TEST_DB_HOST"),
    port: envNumber("TEST_DB_PORT", 3306),
    user: env("TEST_DB_USER"),
    password: process.env.TEST_DB_PASSWORD || "",
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await conn.end();
}

async function dropAllObjects(conn: Queryable, dbName: string) {
  // Drop views first (they can depend on tables)
  const viewsRes = await conn.query(
    `
SELECT table_name AS name
FROM information_schema.views
WHERE table_schema = ?
`,
    [dbName],
  );

  const views = Array.isArray(viewsRes) ? (viewsRes[0] ?? []) : [];

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const v of views as any[]) {
    const name = String(v?.name || "").trim();
    if (!name) continue;
    await conn.query(`DROP VIEW IF EXISTS \`${name}\``);
  }

  const tablesRes = await conn.query(
    `
SELECT table_name AS name
FROM information_schema.tables
WHERE table_schema = ?
  AND table_type = 'BASE TABLE'
`,
    [dbName],
  );

  const tables = Array.isArray(tablesRes) ? (tablesRes[0] ?? []) : [];

  for (const t of tables as any[]) {
    const name = String(t?.name || "").trim();
    if (!name) continue;
    await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

export async function applySchema(dbName: string) {
  assertTestDb(dbName);

  const root = repoRoot();
  const schemaPath = path.join(root, "mysql_schema.sql");
  const sql = readSqlFile(schemaPath);

  const conn = await connect({
    host: env("TEST_DB_HOST"),
    port: envNumber("TEST_DB_PORT", 3306),
    user: env("TEST_DB_USER"),
    password: process.env.TEST_DB_PASSWORD || "",
    database: dbName,
  });

  await dropAllObjects(conn as unknown as Queryable, dbName);

  await conn.query(sql);
  await conn.end();
}

export async function seedUsers(dbName: string) {
  assertTestDb(dbName);

  const seedPath = path.resolve(__dirname, "../../sql/users.seed.sql");
  const sql = fs.readFileSync(seedPath, "utf8");

  const conn = await connect({
    host: env("TEST_DB_HOST"),
    port: envNumber("TEST_DB_PORT", 3306),
    user: env("TEST_DB_USER"),
    password: process.env.TEST_DB_PASSWORD || "",
    database: dbName,
  });

  await conn.query(sql);
  await conn.end();
}
