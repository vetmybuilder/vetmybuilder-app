// e2e-tests/src/db/wipe.ts
import { connect } from "./mysql";

const KEEP_TABLES = new Set(["users", "user_roles", "roles"]);

// Cap how long any single TRUNCATE will wait for a metadata lock. The
// MySQL default is effectively forever (lock_wait_timeout = 31536000s),
// which is what's been eating the full 2-minute Playwright test budget
// when a previous test leaks a stuck transaction. With this cap, a
// blocked TRUNCATE surfaces fast as a real error inside the wipe call,
// and Playwright shows the actual stack instead of a generic timeout.
// Killing the offender's session below makes that recovery automatic
// for the common case (idle test runner connection still holding MDL).
const LOCK_WAIT_TIMEOUT_SEC = 5;

/**
 * Best-effort: find any other sessions holding metadata locks on this
 * DB and KILL them. Recovers from the symptom we keep hitting on CI -
 * a previous test's connection stays open in idle-in-transaction state
 * after the test finishes, blocking the next wipe's TRUNCATE forever.
 * Requires PROCESS + CONNECTION_ADMIN; the test root user has both.
 */
async function killStaleSessions(
  conn: any,
  dbName: string,
  selfId: number,
): Promise<void> {
  try {
    const [procs] = await conn.query<any[]>(
      `SELECT id FROM information_schema.processlist
        WHERE db = ? AND id <> ?`,
      [dbName, selfId],
    );
    for (const p of procs) {
      const id = p?.id ?? p?.ID;
      if (!id) continue;
      try {
        await conn.query(`KILL ${Number(id)}`);
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* if processlist read fails, fall through; the lock_wait_timeout
       below will still surface the hang as a fast error. */
  }
}

export async function wipeDatabase(dbName: string) {
  const conn = await connect({
    host: process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.TEST_DB_PORT || 3306),
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: dbName,
  });

  await conn.query(`SET SESSION lock_wait_timeout = ${LOCK_WAIT_TIMEOUT_SEC}`);
  await conn.query("SET SESSION innodb_lock_wait_timeout = 5");

  const [idRows] = await conn.query<any[]>(`SELECT CONNECTION_ID() AS id`);
  const selfId = Number(idRows?.[0]?.id) || 0;
  await killStaleSessions(conn, dbName, selfId);

  const [rows] = await conn.query<any[]>(
    `
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = ?
      AND table_type = 'BASE TABLE'
    `,
    [dbName],
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
