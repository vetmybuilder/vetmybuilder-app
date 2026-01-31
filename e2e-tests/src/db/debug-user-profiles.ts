// e2e-tests/src/db/debug-user-profiles.ts
import { connect } from "./mysql";
import { logger } from "../utils/logger";

export async function logUserProfiles(dbName: string) {
  const shard = process.env.TEST_SHARD ?? "unknown";

  const conn = await connect({
    host: process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.TEST_DB_PORT || 3306),
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: dbName,
  });

  try {
    const [countRows] = await conn.query<any[]>(
      "SELECT COUNT(*) AS c FROM `user_profiles`",
    );
    const count = Number(countRows?.[0]?.c ?? 0);

    logger.info(`[USER_PROFILES] db=${dbName} shard=${shard} count=${count}`);

    const [colRows] = await conn.query<any[]>(
      `
      SELECT COLUMN_NAME AS name
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = 'user_profiles'
      ORDER BY ORDINAL_POSITION
      `,
      [dbName],
    );

    const cols = (colRows || [])
      .map((r) => String(r?.name || "").trim())
      .filter(Boolean);

    if (!cols.length) {
      logger.info(
        `[USER_PROFILES] db=${dbName} shard=${shard} no columns found`,
      );
      return;
    }

    const selectCols = cols
      .slice(0, 12)
      .map((c) => `\`${c}\``)
      .join(", ");
    const orderCol = `\`${cols[0]}\``;

    logger.info(
      `[USER_PROFILES] db=${dbName} shard=${shard} cols=${cols.join(",")}`,
    );

    const [rows] = await conn.query<any[]>(
      `SELECT ${selectCols} FROM \`user_profiles\` ORDER BY ${orderCol} DESC LIMIT 5`,
    );

    for (const r of rows || []) {
      logger.info(
        `[USER_PROFILES] db=${dbName} shard=${shard} row=${JSON.stringify(r)}`,
      );
    }
  } finally {
    await conn.end();
  }
}
