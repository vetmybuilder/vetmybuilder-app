// scripts/sim/seed-chris-hires.js
//
// Dev-only helper. Seeds a mix of hire rows on Chris Morris's most recent
// LIVE project so the homeowner project view + tradesman dashboards have
// realistic "multiple hired / declined / cancelled" data to look at.
//
// Usage:
//   node scripts/sim/seed-chris-hires.js
//
// Pre-reqs:
//   - npm run dev:manual has been started at least once (so the Chris
//     emulator user + users row exist, and the sim builders are seeded).
//   - Chris has at least one live project (create one in the UI).

require("dotenv").config({ path: ".env.e2e.local" });

const mysql2 = require("mysql2/promise");
const { BOT_UIDS } = require("./config");

const CHRIS_UID = "chris-morris-homeowner-dev";

// Mix of statuses (incl. pending) for Chris's main project — one per sim
// builder. Builder index maps to BOT_UIDS.builders[i].
const HIRE_PLAN = [
  { builderIdx: 0, status: "pending",   homeownerMessage: "Hi, would love a quote on this." },
  { builderIdx: 1, status: "accepted",  homeownerMessage: "Are you available next month?",   tradesmanMessage: "Yes available, sending dates over." },
  { builderIdx: 2, status: "declined",  homeownerMessage: "Interested in working with you.", tradesmanMessage: "Sorry, fully booked until summer." },
  { builderIdx: 3, status: "pending",   homeownerMessage: "Fancy this one?" },
  { builderIdx: 4, status: "cancelled", homeownerMessage: "Want to do this job?",            cancelReason: "homeowner_changed_mind" },
  { builderIdx: 5, status: "accepted",  homeownerMessage: "Hire on my main project please.", tradesmanMessage: "Sure thing, Chris." },
];

// Extra hires for Elegant (builders[5]) on freshly-seeded side projects so
// Elegant's tradesman dashboard shows multiple hires across statuses.
// Each entry creates one project + one hire with the given status.
const ELEGANT_EXTRA_PROJECTS = [
  { name: "Loft conversion", type: "Loft Conversion", propertyType: "Terraced", bedrooms: 3,
    description: "Want to convert the loft into a master bedroom with ensuite.",
    status: "pending",   homeownerMessage: "Could you take a look at this loft?" },
  { name: "Kitchen extension", type: "Extension", propertyType: "Semi-Detached", bedrooms: 4,
    description: "Single-storey rear extension to enlarge the kitchen.",
    status: "declined",  homeownerMessage: "Available for an extension job?",
    tradesmanMessage: "Sorry, can't take on extensions until autumn." },
  { name: "Garden wall rebuild", type: "Other", propertyType: "Detached", bedrooms: 4,
    description: "Old brick garden wall needs taking down and rebuilding.",
    status: "cancelled", homeownerMessage: "Quick wall rebuild — fancy it?",
    cancelReason: "homeowner_changed_mind" },
];

async function main() {
  const conn = await mysql2.createConnection({
    host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
    database:
      process.env.MYSQL_DATABASE ||
      process.env.TEST_DB_NAME ||
      "vetmybuilder_test_s1_4_w0",
  });

  try {
    // 1. Find Chris's most recent LIVE project — excluding any tagged
    // side-project rows we may have created on a previous run.
    const [projects] = await conn.query(
      `SELECT id, name FROM projects
        WHERE ownerUserId = ?
          AND LOWER(status) = 'live'
          AND name NOT LIKE '[chris-elegant-seed]%'
        ORDER BY id DESC
        LIMIT 1`,
      [CHRIS_UID],
    );
    const project = projects[0];
    if (!project) {
      console.error(
        `[seed-chris-hires] No live project found for ${CHRIS_UID}. ` +
          `Create one in the UI first, then re-run.`,
      );
      process.exit(1);
    }
    console.log(`[seed-chris-hires] Using project ${project.id} (${project.name})`);

    // 2. Wipe existing hires for this project so the script is idempotent
    const [delResult] = await conn.query(
      `DELETE FROM hires WHERE projectId = ?`,
      [project.id],
    );
    if (delResult.affectedRows > 0) {
      console.log(`[seed-chris-hires] Cleared ${delResult.affectedRows} existing hire(s)`);
    }

    // 3. Insert one hire per plan entry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let inserted = 0;
    for (const plan of HIRE_PLAN) {
      const tradesmanUid = BOT_UIDS.builders[plan.builderIdx];

      // Verify the tradesman row exists (sim must have run)
      const [tmRows] = await conn.query(
        `SELECT user_id, company_name FROM tradesmen WHERE user_id = ? LIMIT 1`,
        [tradesmanUid],
      );
      if (tmRows.length === 0) {
        console.warn(
          `[seed-chris-hires] Skipping builder idx ${plan.builderIdx} — ` +
            `no tradesman row for ${tradesmanUid} (run the sim first).`,
        );
        continue;
      }
      const company = tmRows[0].company_name;

      const respondedAt =
        plan.status === "accepted" || plan.status === "declined" ? now : null;
      const cancelledAt = plan.status === "cancelled" ? now : null;

      await conn.query(
        `INSERT INTO hires
           (projectId, homeownerUid, tradesmanUserId,
            homeownerMessage, tradesmanMessage, cancelReason,
            status, hiredAt, respondedAt, cancelledAt, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          project.id,
          CHRIS_UID,
          tradesmanUid,
          plan.homeownerMessage || null,
          plan.tradesmanMessage || null,
          plan.cancelReason || null,
          plan.status,
          now,
          respondedAt,
          cancelledAt,
          expiresAt,
        ],
      );
      inserted++;
      console.log(`  + ${plan.status.padEnd(9)} ${company}`);
    }

    console.log(`[seed-chris-hires] Done — inserted ${inserted} hire(s) on main project.`);

    // 4. Extra projects + hires for Elegant
    const elegantUid = BOT_UIDS.builders[5];
    const [elegantRows] = await conn.query(
      `SELECT user_id FROM tradesmen WHERE user_id = ? LIMIT 1`,
      [elegantUid],
    );
    if (elegantRows.length === 0) {
      console.warn(`[seed-chris-hires] Skipping Elegant extras — no tradesman row for ${elegantUid}`);
      return;
    }

    // Wipe any prior extras (idempotent) — match by name prefix tag.
    const TAG = "[chris-elegant-seed]";
    const [oldExtras] = await conn.query(
      `SELECT id FROM projects WHERE ownerUserId = ? AND name LIKE ?`,
      [CHRIS_UID, `${TAG}%`],
    );
    if (oldExtras.length > 0) {
      const oldIds = oldExtras.map((r) => r.id);
      await conn.query(`DELETE FROM hires WHERE projectId IN (?)`, [oldIds]);
      await conn.query(`DELETE FROM notifications WHERE projectId IN (?)`, [oldIds]);
      await conn.query(`DELETE FROM projects WHERE id IN (?)`, [oldIds]);
      console.log(`[seed-chris-hires] Cleared ${oldIds.length} previous Elegant extra project(s)`);
    }

    let extrasInserted = 0;
    for (const extra of ELEGANT_EXTRA_PROJECTS) {
      // Create the project
      const [projInsert] = await conn.query(
        `INSERT INTO projects
           (name, type, location, description, propertyType, bedrooms,
            ownerUserId, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'live', NOW(), NOW())`,
        [
          `${TAG} ${extra.name}`,
          extra.type,
          "E4",
          extra.description,
          extra.propertyType,
          extra.bedrooms,
          CHRIS_UID,
        ],
      );
      const newProjectId = projInsert.insertId;

      const respondedAt =
        extra.status === "accepted" || extra.status === "declined" ? now : null;
      const cancelledAt = extra.status === "cancelled" ? now : null;

      await conn.query(
        `INSERT INTO hires
           (projectId, homeownerUid, tradesmanUserId,
            homeownerMessage, tradesmanMessage, cancelReason,
            status, hiredAt, respondedAt, cancelledAt, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newProjectId,
          CHRIS_UID,
          elegantUid,
          extra.homeownerMessage || null,
          extra.tradesmanMessage || null,
          extra.cancelReason || null,
          extra.status,
          now,
          respondedAt,
          cancelledAt,
          expiresAt,
        ],
      );
      extrasInserted++;
      console.log(`  + Elegant ${extra.status.padEnd(9)} on project "${extra.name}"`);
    }

    console.log(`[seed-chris-hires] Done — ${extrasInserted} Elegant extra project/hire pair(s).`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[seed-chris-hires] Failed:", err);
  process.exit(1);
});
