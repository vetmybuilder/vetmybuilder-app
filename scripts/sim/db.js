"use strict";

async function deleteSimData(recIds) {
  const mysql2 = require("mysql2/promise");

  const conn = await mysql2.createConnection({
    host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
    database:
      process.env.MYSQL_DATABASE ||
      process.env.TEST_DB_NAME ||
      "vetmybuilder_test_s1_4_w0",
    multipleStatements: true,
  });

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    // Delete likes on known recommendation IDs
    if (recIds.length > 0) {
      await conn.query(
        "DELETE FROM recommendation_votes WHERE recommendationId IN (?)",
        [recIds]
      );
    }

    // Delete builder interest rows and profile shares
    await conn.query(
      "DELETE FROM tradesman_interests WHERE fromUid LIKE 'sim-%'"
    );
    await conn.query(
      "DELETE FROM trade_shares WHERE tradesman_uid LIKE 'sim-%'"
    );

    // Delete ALL sim-owned projects and their dependent data.
    // Uses ownerUserId LIKE 'sim-%' to catch both sim-neighbour-* and any other sim owners.
    const [simProjectRows] = await conn.query(
      "SELECT id FROM projects WHERE ownerUserId LIKE 'sim-%'"
    );
    const simProjectIds = simProjectRows.map((r) => r.id);
    console.log(`  [db] found ${simProjectIds.length} sim-owned project(s) to delete`);

    if (simProjectIds.length > 0) {
      try {
        const [r1] = await conn.query(
          "DELETE FROM project_closure_photos WHERE projectId IN (?)",
          [simProjectIds]
        );
        console.log(`  [db] deleted ${r1.affectedRows} closure photo(s)`);
      } catch (e) {
        console.warn(`  [db] project_closure_photos delete skipped: ${e.message}`);
      }
      try {
        const [r2] = await conn.query(
          "DELETE FROM project_closures WHERE projectId IN (?)",
          [simProjectIds]
        );
        console.log(`  [db] deleted ${r2.affectedRows} project closure(s)`);
      } catch (e) {
        console.warn(`  [db] project_closures delete skipped: ${e.message}`);
      }
      const [r3] = await conn.query(
        "DELETE FROM recommendations WHERE projectId IN (?)",
        [simProjectIds]
      );
      console.log(`  [db] deleted ${r3.affectedRows} recommendation(s)`);
      const [r4] = await conn.query(
        "DELETE FROM projects WHERE id IN (?)",
        [simProjectIds]
      );
      console.log(`  [db] deleted ${r4.affectedRows} project(s)`);
    }

    // Delete neighbour-submitted recommendations on other projects (recommenderUserId = sim-neighbour-*)
    await conn.query(
      "DELETE FROM recommendations WHERE recommenderUserId LIKE 'sim-%'"
    );
    if (recIds.length > 0) {
      await conn.query("DELETE FROM recommendations WHERE id IN (?)", [recIds]);
    }

    // Delete spotlight placement for sim tradesmen
    await conn.query(
      "DELETE FROM payments_oneoff WHERE user_id LIKE 'sim-%' AND type = 'spotlight'"
    );

    // Delete tradesman photos and profiles
    await conn.query("DELETE FROM tradesmen_photos WHERE tradesman_user_id LIKE 'sim-%'");
    await conn.query("DELETE FROM tradesmen WHERE user_id LIKE 'sim-%'");

    // Delete user roles and user rows
    await conn.query("DELETE FROM user_roles WHERE uid LIKE 'sim-%'");
    await conn.query("DELETE FROM users WHERE uid LIKE 'sim-%'");

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await conn.end();
  }
}

module.exports = { deleteSimData };
