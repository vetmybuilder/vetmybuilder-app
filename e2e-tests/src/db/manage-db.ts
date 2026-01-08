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
  if (!Number.isFinite(n))
    throw new Error(`Invalid number for ${name}: ${raw}`);
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

export async function ensureDatabase(dbName: string) {
  if (!dbName.includes("test")) {
    throw new Error(`Refusing to touch non-test DB: ${dbName}`);
  }

  const conn = await connect({
    host: env("TEST_DB_HOST"),
    port: envNumber("TEST_DB_PORT", 3306),
    user: env("TEST_DB_USER"),
    password: process.env.TEST_DB_PASSWORD || "",
  });

  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await conn.query(`CREATE DATABASE \`${dbName}\``);

  await conn.end();
}

export async function applySchema(dbName: string) {
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

  await conn.query(sql);
  await conn.end();
}

export async function seedUsers(dbName: string) {
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
