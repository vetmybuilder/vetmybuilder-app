"use strict";

/**
 * Seed synthetic data for AI module testing.
 *
 * Creates diverse projects, recommendations with varied comment quality,
 * then runs all AI modules (classifier, signaller, summariser, job matcher,
 * enricher) in stub mode and prints results.
 *
 * Usage:
 *   node scripts/sim/seed-ai-test-data.js
 *
 * Requires dev:manual to be running (MySQL on shard-1).
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mysql2 = require("mysql2/promise");
const { logger } = require("../../server/lib/logger");

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "vetmybuilder_test_s1_4_w0",
};

// ── Synthetic projects ───────────────────────────────────────────────

const PROJECTS = [
  {
    name: "Ground floor extension — knock-through kitchen-diner",
    type: "Extension",
    location: "E4 8QJ",
    description:
      "We want to extend our ground floor by about 4 metres into the garden to create an open-plan kitchen-diner. The existing kitchen wall will be knocked through with a steel beam. We need foundations, blockwork, flat roof with skylights, bifold doors to the garden, plastering, electrics, plumbing for relocated kitchen, underfloor heating and full decoration. Planning permission already granted.",
    propertyType: "Semi-Detached",
    bedrooms: 3,
  },
  {
    name: "Full rewire — 1930s terraced house",
    type: "Electrical",
    location: "E17 4PP",
    description:
      "Our house still has the original 1930s wiring with fabric-insulated cables and an old fuse box. We need a complete rewire throughout including new consumer unit, all circuits replaced, new sockets and switches in every room, outdoor lighting, smoke alarms and an EICR certificate. The house is occupied so we need to work room by room.",
    propertyType: "Terraced",
    bedrooms: 3,
  },
  {
    name: "Bathroom refurbishment — walk-in shower conversion",
    type: "Bathroom",
    location: "N17 8LB",
    description:
      "Convert our existing bath/shower room into a modern walk-in wet room. Remove bath, install level-access tiled shower with glass screen, wall-hung vanity, concealed cistern WC, heated towel rail, extraction fan and LED mirrors. All tiling floor to ceiling. Underfloor heating preferred.",
    propertyType: "Flat",
    bedrooms: 2,
  },
  {
    name: "Damp proofing and replastering — Victorian terrace",
    type: "Damp Proofing",
    location: "E4 6BL",
    description:
      "Rising damp in our front reception room and hallway. Previous treatment has failed. Need injection DPC, removal of contaminated plaster, re-rendering with salt-resistant plaster, and full redecoration. Possibly tanking the cellar area too if inspection reveals issues.",
    propertyType: "Terraced",
    bedrooms: 4,
  },
  {
    name: "New boiler and central heating system",
    type: "Heating",
    location: "E4 9AB",
    description:
      "Replace our 20-year-old back boiler with a modern combi or system boiler. Full central heating system — new radiators throughout (7 rooms), TRVs, smart thermostat (Hive or Nest), magnetic filter, and full system flush. Gas Safe registered essential. Also need to move the boiler from the fireplace to the kitchen.",
    propertyType: "Semi-Detached",
    bedrooms: 3,
  },
  {
    name: "Loft conversion — dormer with ensuite",
    type: "Loft Conversion",
    location: "E4 7RS",
    description:
      "Dormer loft conversion to create a master bedroom with ensuite shower room. Structural steel, dormer construction, Velux window to rear, staircase from landing, full insulation to current regs, electrics, plumbing for ensuite (shower, basin, WC), plastering and decoration. Building regs drawings ready.",
    propertyType: "Detached",
    bedrooms: 4,
  },
  {
    name: "Garden landscaping and fencing",
    type: "Landscaping",
    location: "N17 9EF",
    description:
      "Complete garden makeover. Remove overgrown shrubs, level the lawn area, lay new turf, build a small raised patio with porcelain paving, install 6ft close-board fencing on three sides (approx 25 metres total), garden lighting and a timber shed base. Medium-sized suburban garden.",
    propertyType: "Semi-Detached",
    bedrooms: 3,
  },
  {
    name: "Roof repair — missing tiles and flashing",
    type: "Roofing",
    location: "E4 8ST",
    description:
      "Roof is leaking in two places. Several concrete tiles missing or cracked on the front slope, and the lead flashing around the chimney has lifted. Need scaffolding, tile replacement, re-dress or replace chimney flashing, check all ridge tiles and re-bed any loose ones. Also clean gutters and replace one downpipe.",
    propertyType: "Terraced",
    bedrooms: 3,
  },
];

// ── Synthetic tradesmen ──────────────────────────────────────────────

const TRADESMEN = [
  {
    uid: "ai-trade-plumber-001",
    companyName: "Aquafix Plumbing & Heating",
    contactName: "Dave Thompson",
    email: "dave@aquafix-plumbing.co.uk",
    tradeTypes: "Plumber, Bathroom Fitter, Boiler Installer, Heating Engineer",
    serviceAreas: "E4, E17, N17, E10",
    status: "active",
  },
  {
    uid: "ai-trade-sparky-001",
    companyName: "BrightSpark Electrical",
    contactName: "James Chen",
    email: "james@brightspark-elec.co.uk",
    tradeTypes: "Electrician, Solar PV",
    serviceAreas: "E4, E17, N17, E10, E11",
    status: "active",
  },
  {
    uid: "ai-trade-builder-001",
    companyName: "Cornerstone Construction Ltd",
    contactName: "Mark Williams",
    email: "mark@cornerstoneconstruction.co.uk",
    tradeTypes: "General Builder, Extension Builder, Bricklayer, Roofer",
    serviceAreas: "E4, E17, N17",
    status: "active",
  },
  {
    uid: "ai-trade-kitchen-001",
    companyName: "Premier Kitchens & Bathrooms",
    contactName: "Sarah Palmer",
    email: "sarah@premierkb.co.uk",
    tradeTypes: "Kitchen Fitter, Bathroom Fitter, Tiler, Carpenter / Joiner",
    serviceAreas: "E4, E17, N9, EN1",
    status: "active",
  },
  {
    uid: "ai-trade-landscape-001",
    companyName: "Green Spaces Gardens",
    contactName: "Tom Reeves",
    email: "tom@greenspacesgardens.co.uk",
    tradeTypes: "Landscaper, Fencing, Driveways / Paving",
    serviceAreas: "E4, E17, N17, E10, N9",
    status: "active",
  },
  {
    uid: "ai-trade-damp-001",
    companyName: "DryHome Preservation",
    contactName: "Alan Scott",
    email: "alan@dryhome.co.uk",
    tradeTypes: "External Wall Insulation, Cavity Wall Insulation, Plasterer",
    serviceAreas: "E4, E17, N17, N18",
    status: "active",
  },
];

// ── Synthetic homeowners ─────────────────────────────────────────────

const HOMEOWNERS = [
  { uid: "ai-ho-001", email: "alice@example.com", firstName: "Alice", lastName: "Chen", location: "E4 8QJ" },
  { uid: "ai-ho-002", email: "bob@example.com", firstName: "Bob", lastName: "Jones", location: "E17 4PP" },
  { uid: "ai-ho-003", email: "carol@example.com", firstName: "Carol", lastName: "Smith", location: "N17 8LB" },
  { uid: "ai-ho-004", email: "dave@example.com", firstName: "Dave", lastName: "Patel", location: "E4 6BL" },
  { uid: "ai-ho-005", email: "emma@example.com", firstName: "Emma", lastName: "Williams", location: "E4 9AB" },
  { uid: "ai-ho-006", email: "frank@example.com", firstName: "Frank", lastName: "Taylor", location: "E4 7RS" },
  { uid: "ai-ho-007", email: "grace@example.com", firstName: "Grace", lastName: "Brown", location: "N17 9EF" },
  { uid: "ai-ho-008", email: "henry@example.com", firstName: "Henry", lastName: "Wilson", location: "E4 8ST" },
];

// ── Recommendations with varied quality ──────────────────────────────

const RECOMMENDATIONS = [
  // Detailed, specific, high quality
  {
    projectIdx: 0, tradesmanIdx: 2,
    comment: "Mark and his team did our rear extension last spring. They were on site every day at 7:30am, kept the site immaculately clean, and finished two days ahead of the eight-week schedule. The steelwork was signed off first time by building control. Total cost came in £800 under the original quote because they found a more efficient way to route the drainage. Would use them again in a heartbeat.",
  },
  {
    projectIdx: 1, tradesmanIdx: 1,
    comment: "James rewired our entire 1930s house room by room while we were living in it. He was incredibly careful about minimising disruption — plastic sheeting everywhere, hoovered up every day. The new consumer unit is beautifully installed with clear labelling. He spotted some dodgy earthing the previous sparky had done and fixed it at no extra cost. Certificate issued same day.",
  },
  {
    projectIdx: 2, tradesmanIdx: 0,
    comment: "Dave converted our old bathroom into a stunning wet room. The tanking was done properly with lifetime guarantee, underfloor heating works perfectly, and the tiling is absolutely flawless. He sourced the wall-hung vanity for us at trade price saving about £400. Only minor niggle was a two-day delay waiting for the glass screen, but he kept us informed throughout.",
  },
  {
    projectIdx: 5, tradesmanIdx: 2,
    comment: "Cornerstone did our loft conversion and it was a big job — new dormer, ensuite, staircase from the landing. Mark project-managed the whole thing brilliantly, coordinating his bricklayer, roofer, plumber and electrician so there was never any downtime. Building regs signed off with no issues. The ensuite plumbing is tucked away neatly and the staircase feels like it was always part of the house.",
  },
  // Medium quality — positive but less specific
  {
    projectIdx: 3, tradesmanIdx: 5,
    comment: "Good job on the damp proofing. The team was professional and tidy. Work completed on time and the follow-up inspection confirmed everything was done properly. Would recommend.",
  },
  {
    projectIdx: 4, tradesmanIdx: 0,
    comment: "Dave installed our new boiler and radiators. Everything works well and he explained the system clearly. Reasonably priced and clean workers.",
  },
  {
    projectIdx: 6, tradesmanIdx: 4,
    comment: "Tom and his lad did a great job on our garden. New lawn looks brilliant and the fencing is solid. Came back to adjust one fence panel that had shifted after heavy rain.",
  },
  {
    projectIdx: 7, tradesmanIdx: 2,
    comment: "Fixed our roof leak and replaced the flashing. Scaffolding up and down in a day. No more leaks since. Fair price.",
  },
  // Generic / low quality
  {
    projectIdx: 0, tradesmanIdx: 3,
    comment: "Good work.",
  },
  {
    projectIdx: 1, tradesmanIdx: 2,
    comment: "Would recommend.",
  },
  {
    projectIdx: 4, tradesmanIdx: 3,
    comment: "They did the job. Happy enough with it. On time.",
  },
  {
    projectIdx: 6, tradesmanIdx: 2,
    comment: "Decent job, no complaints really.",
  },
];

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql2.createConnection(DB_CONFIG);
  logger.info(`[ai-seed] Connected to ${DB_CONFIG.database}`);

  try {
    // 1. Insert homeowners
    logger.info("[ai-seed] Creating homeowners...");
    for (const h of HOMEOWNERS) {
      const outward = h.location.split(" ")[0];
      await conn.query(
        `INSERT INTO users (uid, email, firstName, lastName, username, locationRaw, postcodeOutward, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE email = VALUES(email)`,
        [h.uid, h.email, h.firstName, h.lastName, h.email.split("@")[0], h.location, outward],
      );
    }
    logger.info(`[ai-seed] ${HOMEOWNERS.length} homeowners`);

    // 2. Insert tradesmen
    logger.info("[ai-seed] Creating tradesmen...");
    for (const t of TRADESMEN) {
      await conn.query(
        `INSERT INTO tradesmen (user_id, company_name, contact_name, email, trade_types, service_areas, status, created_at, updated_at, public_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), UUID())
         ON DUPLICATE KEY UPDATE
           company_name = VALUES(company_name),
           trade_types = VALUES(trade_types),
           service_areas = VALUES(service_areas),
           status = VALUES(status)`,
        [t.uid, t.companyName, t.contactName, t.email, t.tradeTypes, t.serviceAreas, t.status],
      );
    }
    logger.info(`[ai-seed] ${TRADESMEN.length} tradesmen`);

    // 3. Insert projects
    logger.info("[ai-seed] Creating projects...");
    const projectIds = [];
    for (let i = 0; i < PROJECTS.length; i++) {
      const p = PROJECTS[i];
      const ho = HOMEOWNERS[i];
      const [result] = await conn.query(
        `INSERT INTO projects (ownerUserId, name, type, location, description, propertyType, bedrooms, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'live', NOW())`,
        [ho.uid, p.name, p.type, p.location, p.description, p.propertyType, p.bedrooms],
      );
      projectIds.push(result.insertId);
    }
    logger.info(`[ai-seed] ${projectIds.length} projects (IDs: ${projectIds.join(", ")})`);

    // 4. Insert recommendations
    logger.info("[ai-seed] Creating recommendations...");
    let recCount = 0;
    for (const rec of RECOMMENDATIONS) {
      const projectId = projectIds[rec.projectIdx];
      const tradesman = TRADESMEN[rec.tradesmanIdx];
      const recommenderIdx = (rec.projectIdx + 1) % HOMEOWNERS.length;
      await conn.query(
        `INSERT INTO recommendations (projectId, recommenderUserId, name, company, comment, rating, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [projectId, HOMEOWNERS[recommenderIdx].uid, tradesman.contactName, tradesman.companyName, rec.comment, 5],
      );
      recCount++;
    }
    logger.info(`[ai-seed] ${recCount} recommendations`);

    // 5. Run AI modules
    logger.info("[ai-seed] Running AI modules in stub mode...");

    // Use LLM_MODE from env (default: auto-detect based on ANTHROPIC_API_KEY)
    if (!process.env.LLM_MODE) {
      process.env.LLM_MODE = process.env.ANTHROPIC_API_KEY ? "real" : "stub";
    }
    logger.info(`[ai-seed] LLM_MODE = ${process.env.LLM_MODE}`);

    const { classifyProject } = require("../../server/lib/ai/projectClassifier");
    const { computeRecommendationSignals } = require("../../server/lib/ai/recommendationSignaller");
    const { summariseBuilderRecommendations } = require("../../server/lib/ai/recommendationSummariser");
    const { scoreMatch } = require("../../server/lib/ai/jobMatcher");
    const { notifyMatchedTradesmen } = require("../../server/lib/ai/notifyMatchedTradesmen");

    // Wrap conn.query for the modules that expect mysqlQuery(sql, params)
    const mysqlQuery = async (sql, params) => {
      const [rows] = await conn.query(sql, params);
      return rows;
    };

    // 5a. Classify projects
    logger.info("[ai-seed] -- Project Classification --");
    const silentLog = { info: () => {}, warn: () => {}, error: () => {} };
    for (let i = 0; i < PROJECTS.length; i++) {
      const p = PROJECTS[i];
      const result = await classifyProject({
        mysqlQuery,
        projectId: projectIds[i],
        type: p.type,
        description: p.description,
        location: p.location,
        propertyType: p.propertyType,
        bedrooms: p.bedrooms,
        log: silentLog,
      });
      logger.info(`  ${p.name.slice(0, 50).padEnd(50)} -> ${result ? JSON.stringify(result) : "null"}`);
    }

    // 5b. Recommendation signals
    logger.info("[ai-seed] -- Recommendation Signals --");
    const [allRecs] = await conn.query("SELECT id, comment FROM recommendations ORDER BY id");
    for (const rec of allRecs) {
      const result = await computeRecommendationSignals({
        mysqlQuery,
        recommendationId: rec.id,
        comment: rec.comment,
        log: silentLog,
      });
      const preview = (rec.comment || "").slice(0, 40).padEnd(40);
      if (result) {
        logger.info(`  rec#${String(rec.id).padEnd(3)} "${preview}" -> words=${result.wordCount} generic=${result.genericScore} sentiment=${result.sentiment} themes=${JSON.stringify(result.themes)}`);
      } else {
        logger.info(`  rec#${String(rec.id).padEnd(3)} "${preview}" -> null`);
      }
    }

    // 5c. Builder summaries
    logger.info("[ai-seed] -- Builder Summaries --");
    for (const t of TRADESMEN) {
      const [recs] = await conn.query(
        "SELECT r.id, r.comment FROM recommendations r WHERE r.company = ?",
        [t.companyName],
      );
      if (recs.length === 0) continue;
      const result = await summariseBuilderRecommendations({
        mysqlQuery,
        company: t.companyName,
        comments: recs.map((r) => r.comment),
        recommendationIds: recs.map((r) => r.id),
        log: silentLog,
      });
      logger.info(`  ${t.companyName.padEnd(35)} -> ${result ? JSON.stringify(result.bullets) : "null"} (${recs.length} recs)`);
    }

    // 5d. Job matching
    logger.info("[ai-seed] -- Job Matching (scores) --");
    for (let i = 0; i < PROJECTS.length; i++) {
      const p = PROJECTS[i];
      // In stub mode the classifier always returns ["General Builder"]
      // Use a more realistic set based on the project type
      const recTrades = [p.type];
      logger.info(`  Project: ${p.name}`);
      const matches = [];
      for (const t of TRADESMEN) {
        const result = scoreMatch({
          projectType: p.type,
          projectLocation: p.location,
          recommendedTrades: recTrades,
          tradesmanTrades: t.tradeTypes.split(",").map((s) => s.trim()),
          tradesmanAreas: t.serviceAreas.split(",").map((s) => s.trim()),
          projectCreatedAt: new Date().toISOString(),
        });
        if (result.total > 0) {
          matches.push({ name: t.companyName, ...result });
        }
      }
      matches.sort((a, b) => b.total - a.total);
      for (const m of matches) {
        logger.info(`    ${m.name.padEnd(35)} total=${m.total} (trade=${m.trade} loc=${m.location} recency=${m.recency})`);
      }
      if (matches.length === 0) logger.info("    (no matches)");
    }

    // 5e. Notify matched tradesmen (for first project)
    logger.info("[ai-seed] -- Notify Matched Tradesmen (project #1) --");
    const notifyResult = await notifyMatchedTradesmen({
      mysqlQuery,
      projectId: projectIds[0],
      log: { info: (...a) => logger.info(`[notify] ${a.join(" ")}`), warn: () => {}, error: () => {} },
    });
    logger.info(`[ai-seed] Result: notified=${notifyResult.notified} skipped=${notifyResult.skipped}`);

    // Summary
    logger.info("[ai-seed] -- DB Row Counts --");
    const tables = ["project_classifications", "recommendation_signals", "builder_summaries", "ai_inference_log"];
    for (const t of tables) {
      try {
        const [rows] = await conn.query(`SELECT COUNT(*) as n FROM ${t}`);
        logger.info(`  ${t.padEnd(30)} ${rows[0].n}`);
      } catch {
        logger.info(`  ${t.padEnd(30)} (table not found - restart dev:manual on this branch)`);
      }
    }
    logger.info("[ai-seed] Done.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  logger.error({ err: err?.message || err }, "[ai-seed] Fatal error");
  process.exit(1);
});
