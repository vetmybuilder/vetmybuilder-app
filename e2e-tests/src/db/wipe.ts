// e2e-tests/src/db/wipe.ts
import { connect } from "./mysql";

const KEEP_TABLES = new Set(["users", "user_roles", "roles"]);

// Cap how long any single TRUNCATE will wait for a metadata lock. The
// MySQL default is effectively forever (lock_wait_timeout = 31536000s),
// which is what's been eating the full 2-minute Playwright test budget
// when a previous test leaks a stuck transaction. With this cap, a
// blocked TRUNCATE surfaces fast as a real error inside the wipe call,
// and Playwright shows the actual stack instead of a generic timeout.
const LOCK_WAIT_TIMEOUT_SEC = 5;

// Per-DB advisory-lock timeout. If another worker's wipe holds the
// lock longer than this, we time out and surface a clear error rather
// than silently racing it.
const ADVISORY_LOCK_TIMEOUT_SEC = 30;

// Retry the wipe on transient connection failures (e.g. another worker
// killed our session, or MySQL bounced the connection). The first
// attempt covers the happy path; the retry covers the rare overlap.
const WIPE_RETRIES = 2;

async function killOtherSessions(
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
    /* processlist read can fail without admin privs; the wipe still
       proceeds and the verify-then-DELETE fallback below catches any
       row that survived. */
  }
}

function isTransientConnError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  const code = String((err as any)?.code ?? "");
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "ER_QUERY_INTERRUPTED" ||
    /Connection lost|server closed the connection|Lost connection|ECONNRESET/i.test(
      msg,
    )
  );
}

async function wipeOnce(dbName: string): Promise<void> {
  const conn = await connect({
    host: process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.TEST_DB_PORT || 3306),
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: dbName,
  });

  // Per-DB advisory lock serialises concurrent wipes against the same
  // DB. Replaces the old "KILL every other session on this DB" trick
  // which was the source of the worst flakes: two workers racing each
  // other's wipes would kill each other's connections mid-TRUNCATE,
  // leaving the DB partially wiped and the next test starting with
  // leftover rows. The lock auto-releases on connection close so a
  // dead worker can't deadlock its peers.
  const lockName = `vmb_wipe:${dbName}`;
  try {
    await conn.query(`SET SESSION lock_wait_timeout = ${LOCK_WAIT_TIMEOUT_SEC}`);
    await conn.query("SET SESSION innodb_lock_wait_timeout = 5");

    const [lockRows] = await conn.query<any[]>(`SELECT GET_LOCK(?, ?) AS got`, [
      lockName,
      ADVISORY_LOCK_TIMEOUT_SEC,
    ]);
    const got = Number(lockRows?.[0]?.got);
    if (got !== 1) {
      throw new Error(
        `wipeDatabase: failed to acquire advisory lock '${lockName}' within ${ADVISORY_LOCK_TIMEOUT_SEC}s (got=${got}). Another wipe is likely stuck.`,
      );
    }

    // Kill every other session on this DB now that we hold the wipe
    // lock. The API server's mysql pool keeps connections in a
    // REPEATABLE-READ snapshot - without forcing a reconnect, the
    // next request can still see pre-wipe rows (which surfaces as
    // "test 1's tradesman shows up in test 2's deck"). Safe under
    // the advisory lock because no peer wipe can be holding a
    // connection here. The API server's pool will reconnect on its
    // next query and see the post-wipe state.
    const [idRows] = await conn.query<any[]>(`SELECT CONNECTION_ID() AS id`);
    const selfId = Number(idRows?.[0]?.id) || 0;
    await killOtherSessions(conn, dbName, selfId);

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
    try {
      for (const r of rows) {
        const name = r?.name;
        if (!name) continue;
        const table = String(name);
        if (KEEP_TABLES.has(table)) continue;
        await conn.query(`TRUNCATE TABLE \`${table}\``);
      }

      // Self-check the canonical "this should be empty" tables. If
      // TRUNCATE silently no-op'd (lock contention swallowed, isolation
      // snapshot, MDL skipping the actual delete - we've seen all
      // three) the next test would start with stale rows and the
      // failures look like assertion bugs. DELETE FROM acts as a
      // belt-and-braces fallback - it always touches rows even when
      // TRUNCATE doesn't, and we surface a loud error if the table
      // still isn't empty afterwards.
      const VERIFY_TABLES = ["tradesmen", "favourite_tradesmen", "projects"];
      for (const table of VERIFY_TABLES) {
        const [exists] = await conn.query<any[]>(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1`,
          [dbName, table],
        );
        if (!exists?.length) continue;
        const [countRows] = await conn.query<any[]>(
          `SELECT COUNT(*) AS n FROM \`${table}\``,
        );
        const n = Number(countRows?.[0]?.n) || 0;
        if (n > 0) {
          await conn.query(`DELETE FROM \`${table}\``);
          const [recheck] = await conn.query<any[]>(
            `SELECT COUNT(*) AS n FROM \`${table}\``,
          );
          const after = Number(recheck?.[0]?.n) || 0;
          if (after > 0) {
            throw new Error(
              `wipeDatabase: '${table}' still has ${after} rows after TRUNCATE + DELETE on '${dbName}'. Test data leaking across runs.`,
            );
          }
        }
      }
    } finally {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    }

    await conn.query(`SELECT RELEASE_LOCK(?)`, [lockName]).catch(() => {});
  } finally {
    await conn.end().catch(() => {});
  }
}

export async function wipeDatabase(dbName: string) {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < WIPE_RETRIES; attempt++) {
    try {
      await wipeOnce(dbName);
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientConnError(err) || attempt === WIPE_RETRIES - 1) {
        throw err;
      }
      // Brief backoff before retrying with a fresh connection.
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr;
}
