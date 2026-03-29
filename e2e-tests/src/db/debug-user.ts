// e2e-tests/src/db/debug-user.ts
import { connect } from "./mysql";
import { logger } from "../utils/logger";

export async function logUserStateByEmail(dbName: string, email: string) {
  const shard = process.env.TEST_SHARD ?? "unknown";

  const conn = await connect({
    host: process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.TEST_DB_PORT || 3306),
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: dbName,
  });

  try {
    // user_profiles
    const [profiles] = await conn.query<any[]>(
      `SELECT * FROM user_profiles WHERE email = ? LIMIT 5`,
      [email],
    );

    logger.info(
      `[USER_PROFILES] db=${dbName} shard=${shard} email=${email} rows=${profiles?.length ?? 0}`,
    );

    if (profiles?.length) {
      const p = profiles[0];
      logger.info(
        `[USER_PROFILES] sample db=${dbName} shard=${shard} uid=${p.user_id ?? p.uid ?? "?"} firstName=${p.first_name ?? p.firstName ?? "?"} lastName=${p.last_name ?? p.lastName ?? "?"}`,
      );
    }

    // users
    const [users] = await conn.query<any[]>(
      `SELECT * FROM users WHERE email = ? LIMIT 5`,
      [email],
    );

    logger.info(
      `[USERS] db=${dbName} shard=${shard} email=${email} rows=${users?.length ?? 0}`,
    );

    if (users?.length) {
      const u = users[0];
      logger.info(
        `[USERS] sample db=${dbName} shard=${shard} uid=${u.uid ?? u.id ?? "?"} firstName=${u.firstName ?? u.first_name ?? "?"} lastName=${u.lastName ?? u.last_name ?? "?"} username=${u.username ?? "?"}`,
      );
    }
  } catch (e: any) {
    logger.info(
      `[DB DEBUG] db=${dbName} shard=${shard} email=${email} error=${e?.message || "unknown"}`,
    );
  } finally {
    await conn.end();
  }
}
