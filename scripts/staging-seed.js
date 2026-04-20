#!/usr/bin/env node
// scripts/staging-seed.js
//
// Seeds the staging database with demo data via direct SQL inserts.
// No Firebase emulator needed — users log in with real Firebase Auth (SSO or email).
// Run: node scripts/staging-seed.js
//
// What it creates:
// - 5 tradesmen (builders) with profiles, photos, verification
// - 2 completed projects with recommendations and closures
// - 2 pipeline entries (1 claimed, 1 unclaimed)
// - Spotlight placement for Elegant

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.staging") });
// Fall back to .env if .env.staging doesn't set everything
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mysql = require("mysql2/promise");

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "vetmybuilder_staging",
  multipleStatements: true,
};

const BUILDERS = [
  {
    uid: "staging-builder-001",
    company: "AD House Construction",
    contact: "Adam Davies",
    trades: "Extension Builder,Loft Conversion Specialist,New Build,General Builder",
    areas: "N1,N21,N14,NW1,NW3,EN1,EN2,N2,N3",
    phone: "07474 162993",
    rating: 4.0,
    reviews: 127,
  },
  {
    uid: "staging-builder-002",
    company: "JB Roofing Solutions Ltd",
    contact: "James Brooks",
    trades: "Roofer,Guttering,Chimney Specialist",
    areas: "N1,N7,E1,E2,EC1,EC2,WC1,WC2,N4,N5",
    phone: "07719 559557",
    rating: 4.0,
    reviews: 153,
  },
  {
    uid: "staging-builder-003",
    company: "Rooftech Roofing And Guttering Ltd",
    contact: "Robert Chen",
    trades: "Roofer,Guttering,Fascias & Soffits",
    areas: "CR0,SE1,SE15,SE17,SW2,SW9,SW16,SE25,CR7",
    phone: "07538 539390",
    rating: 4.4,
    reviews: 160,
  },
  {
    uid: "staging-builder-004",
    company: "Home Improvements Specialist Ltd",
    contact: "Harry Morrison",
    trades: "General Builder,Kitchen Fitter,Bathroom Fitter,Carpenter / Joiner,Tiler",
    areas: "N1,N7,NW1,NW3,WC1,EC1,N4,N5,N8,NW6",
    phone: "07700 189961",
    rating: 4.3,
    reviews: 105,
  },
  // Elegant is NOT listed here — the sim seed creates it via the API with the real
  // Firebase UID (pLT7...) so login, spotlight, and photos all work correctly.
];

const COMPLETED_PROJECTS = [
  {
    name: "Bathroom Remodel in E4 (Semi-Detached)",
    type: "Bathroom Remodel",
    location: "E4",
    owner: "staging-homeowner-001",
    builderCompany: "Elegant Building Services",
    builderPhone: "07828 989106",
    recommender: "staging-neighbour-001",
  },
  {
    name: "Kitchen Fitting in E4 (Terraced)",
    type: "Kitchen Fitting",
    location: "E4",
    owner: "staging-homeowner-002",
    builderCompany: "AD House Construction",
    builderPhone: "07474 162993",
    recommender: "staging-neighbour-002",
  },
];

const PIPELINE_ENTRIES = [
  {
    company: "Elegant Building Services",
    trades: "General Builder,New Build,Extension Builder,Painter / Decorator,Bathroom Fitter,Flooring Specialist,Tiler,Plasterer,External Wall Insulation,Handyman,Roofer",
    areas: "E4,E17,N17",
    rating: 4.8,
    reviews: 167,
    score: 90,
    status: "approved",
    claimedBy: "staging-builder-005",
  },
  {
    company: "E4 Home Renovations Ltd",
    trades: "General Builder,Kitchen Fitter,External Wall Insulation,Bathroom Fitter,Plasterer",
    areas: "E4",
    rating: 4.5,
    reviews: 42,
    score: 75,
    status: "approved",
    claimedBy: null,
    phone: "07700 900456",
  },
];

async function seed() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log(`[staging-seed] Connected to ${DB_CONFIG.database}`);

  try {
    // ── Users (homeowners + neighbours) ──
    const userUids = [
      "staging-homeowner-001", "staging-homeowner-002",
      "staging-neighbour-001", "staging-neighbour-002", "staging-neighbour-003",
      ...BUILDERS.map((b) => b.uid),
    ];
    for (const uid of userUids) {
      await conn.query(
        `INSERT IGNORE INTO users (uid, firstName, lastName, postcode, postcodeSector, postcodeOutward, city, createdAt)
         VALUES (?, 'Demo', 'User', 'E4 7DT', 'E4 7', 'E4', 'Chingford', NOW())`,
        [uid],
      );
    }
    console.log(`[staging-seed] ${userUids.length} users ensured`);

    // ── Cleanup: remove staging-builder-005 (Elegant) if it exists — sim creates the real one ──
    await conn.query(`DELETE FROM tradesmen WHERE user_id = 'staging-builder-005'`).catch(() => {});
    await conn.query(`DELETE FROM user_roles WHERE uid = 'staging-builder-005'`).catch(() => {});
    // Deactivate lead_* Elegant rows so they don't show in spotlight/leaderboard
    await conn.query(`UPDATE tradesmen SET status = 'inactive' WHERE user_id LIKE 'lead_%' AND company_name LIKE '%Elegant%'`).catch(() => {});

    // ── Tradesmen ──
    for (const b of BUILDERS) {
      await conn.query(
        `INSERT IGNORE INTO tradesmen
           (user_id, company_name, contact_name, phone, trade_types, service_areas, status,
            google_rating, google_reviews_count, photo_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 4, NOW(), NOW())`,
        [b.uid, b.company, b.contact, b.phone, b.trades, b.areas, b.rating, b.reviews],
      );

      // User role
      await conn.query(
        `INSERT IGNORE INTO user_roles (uid, role) VALUES (?, 'tradesman')`,
        [b.uid],
      );
    }
    console.log(`[staging-seed] ${BUILDERS.length} tradesmen created`);

    // ── Elegant photos + profile picture ──
    // Fix photos for ALL Elegant rows (staging-builder-005 + the sim-created pLT7... UID)
    const photos = [
      "elegant-profile-logo.png",
      "elegant1.jpeg", "elegant2.jpeg", "elegant3.jpeg",
      "elegant4.jpeg", "elegant5.jpeg",
    ];
    const [elegantRows] = await conn.query(
      `SELECT user_id FROM tradesmen WHERE company_name LIKE '%Elegant%'`,
    );
    for (const row of elegantRows) {
      await conn.query(`DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`, [row.user_id]);
      for (let i = 0; i < photos.length; i++) {
        await conn.query(
          `INSERT INTO tradesmen_photos (tradesman_user_id, url, sort_order) VALUES (?, ?, ?)`,
          [row.user_id, `/uploads/tradesmen/${photos[i]}`, i],
        );
      }
      await conn.query(
        `UPDATE tradesmen SET profile_picture_url = '/uploads/tradesmen/elegant-profile-logo.png', photo_count = ? WHERE user_id = ?`,
        [photos.length, row.user_id],
      );
    }
    console.log(`[staging-seed] Elegant photos fixed for ${elegantRows.length} row(s)`);

    // ── Completed projects ──
    for (const proj of COMPLETED_PROJECTS) {
      const [result] = await conn.query(
        `INSERT INTO projects (name, type, location, description, ownerUserId, status, createdAt, propertyType, bedrooms)
         VALUES (?, ?, ?, ?, ?, 'completed', NOW(), 'Semi-Detached', 3)`,
        [proj.name, proj.type, proj.location, `${proj.type} project in ${proj.location}`, proj.owner],
      );
      const projectId = result.insertId;

      // Find the builder's UID from the tradesmen table
      const [builderRows] = await conn.query(
        `SELECT user_id FROM tradesmen WHERE company_name = ? AND status = 'active' LIMIT 1`,
        [proj.builderCompany],
      );
      const builderUid = builderRows[0]?.user_id || null;

      const [recResult] = await conn.query(
        `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, company, rating, comment, isAnonymous, source, phone)
         VALUES (?, ?, NOW(), ?, ?, 5, ?, 0, 'magic', ?)`,
        [
          projectId, proj.recommender, proj.recommender,
          proj.builderCompany,
          `Great work by ${proj.builderCompany}. Would highly recommend.`,
          proj.builderPhone,
        ],
      );
      const recId = recResult.insertId;

      // Add verification
      await conn.query(
        `INSERT IGNORE INTO company_verifications (recommendationId, status, companyName, score, checkedAt)
         VALUES (?, 'verified', ?, 95, NOW())`,
        [recId, proj.builderCompany],
      );

      // Add votes (likes)
      for (let v = 0; v < 8; v++) {
        await conn.query(
          `INSERT IGNORE INTO recommendation_votes (recommendationId, userId, value, createdAt, updatedAt)
           VALUES (?, ?, 1, NOW(), NOW())`,
          [recId, `staging-voter-${v}`],
        );
      }

      // Close the project
      await conn.query(
        `INSERT INTO project_closures (projectId, didGoAhead, winnerRecommendationId, winner_tradesman_uid, createdAt)
         VALUES (?, 1, ?, ?, NOW())`,
        [projectId, recId, builderUid],
      );

      console.log(`[staging-seed] Completed project: ${proj.name} (winner: ${proj.builderCompany})`);
    }

    // ── Spotlight for Elegant (sim already creates this, but ensure it exists) ──

    // ── Pipeline entries ──
    // Find the real Elegant UID (sim creates pLT7... which has photos/spotlight)
    const [elegantTradesmen] = await conn.query(
      `SELECT user_id FROM tradesmen WHERE company_name LIKE '%Elegant%' AND status = 'active' AND profile_picture_url IS NOT NULL LIMIT 1`,
    );
    const realElegantUid = elegantTradesmen[0]?.user_id || "staging-builder-005";

    await conn.query(`DELETE FROM tradesperson_pipeline`);
    for (const entry of PIPELINE_ENTRIES) {
      const claimedBy = entry.claimedBy ? realElegantUid : null;
      await conn.query(
        `INSERT INTO tradesperson_pipeline
           (company_name, trade_types, service_areas, google_rating, google_reviews_count,
            vetting_score, status, claimed_by, phone, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          entry.company, entry.trades, entry.areas, entry.rating, entry.reviews,
          entry.score, entry.status, claimedBy, entry.phone || null,
        ],
      );
    }
    console.log(`[staging-seed] ${PIPELINE_ENTRIES.length} pipeline entries created (Elegant claimed by ${realElegantUid})`);

    // ── Admin user ──
    await conn.query(
      `INSERT IGNORE INTO users (uid, firstName, lastName, createdAt)
       VALUES ('staging-admin', 'Admin', 'User', NOW())`,
    );
    await conn.query(
      `INSERT IGNORE INTO user_roles (uid, role) VALUES ('staging-admin', 'admin')`,
    );
    console.log(`[staging-seed] Admin user created`);

    console.log(`\n[staging-seed] Done! Database seeded with demo data.`);
    console.log(`[staging-seed] Sign up at https://staging.vetmybuilder.com to start using it.\n`);

  } finally {
    await conn.end();
  }
}

seed().catch((err) => {
  console.error("[staging-seed] Failed:", err.message);
  process.exit(1);
});
