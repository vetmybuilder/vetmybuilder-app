import { test, expect } from "../src/fixtures";
import { connect } from "../src/db/mysql";

test("db is reachable and has tables", async ({ runtime }) => {
  const conn = await connect({
    host: process.env.TEST_DB_HOST || "127.0.0.1",
    port: Number(process.env.TEST_DB_PORT || 3306),
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: runtime.dbName,
  });

  const [rows] = await conn.query<any[]>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ?
      AND table_type = 'BASE TABLE'
    LIMIT 1
    `,
    [runtime.dbName]
  );

  await conn.end();
  expect(rows.length).toBeGreaterThan(0);
});

test("api client exists", async ({ apiClient }) => {
  expect(apiClient).toBeTruthy();
});

test("api health check", async ({ apiClient }) => {
  const res = await apiClient.get("/health");
  expect(res.ok()).toBe(true);
});
