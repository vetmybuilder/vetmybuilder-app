// scripts/dev-manual-sim.js
// Waits for the API server to be ready, then seeds sim data and starts the daemon.
// Runs as part of `npm run dev:manual` in parallel with the server + web processes.

require("dotenv").config({ path: ".env.e2e.local" });

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Never run sim auto-start during E2E tests
if (process.env.TEST_ENV === "e2e" || process.env.CI) {
  process.exit(0);
}

// HARD PRODUCTION GUARD - see scripts/simulate.js for the full incident
// note. This wrapper is invoked by `npm run dev:manual` and must never
// run on a production VM. Refuses to start if NODE_ENV=production unless
// an awkward magic-string override is set.
if (process.env.NODE_ENV === "production") {
  const FORCE_OVERRIDE = "yes-i-really-want-to-burn-money-on-prod";
  if (process.env.VMB_FORCE_SIM_IN_PROD !== FORCE_OVERRIDE) {
    console.error(
      "[dev-manual-sim] REFUSING TO RUN: NODE_ENV=production. This script " +
      "starts the local-dev simulator, which creates fake tradesmen and " +
      "fires paid Google Places API calls. It must never run on prod.",
    );
    process.exit(1);
  }
}

const HEALTH_URL = "http://localhost:3100/health";
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 120_000;

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`  [sim-autostart ${t}] ${msg}`);
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

// Real accounts that need to exist in the local Firebase emulator for manual testing.
// Add entries here if you need to log in as a real (non-sim) user locally.
//
// If `homeownerProfile` is set, a matching row in the MySQL `users` table will be
// upserted so the account is treated as a registered homeowner without going
// through the signup form on every server restart.
const EMULATOR_USERS = [
  {
    localId: "pLT7RLEYByX6IJWzGAMjAKrW5L93",
    email: "info@elegantbuilding.co.uk",
    password: "password",
    displayName: "Elegant Building Services",
  },
  {
    localId: "pimlico-plumbers-tradesman-dev",
    email: "info@pimlicoplumbers.com",
    password: "password",
    displayName: "Pimlico Plumbers",
  },
  {
    // Chris is both a homeowner (used for the project-side test journeys)
    // and an admin (so admin tools are reachable from the same login).
    // ensureHomeownerProfiles writes the users row first; ensureAdminRole
    // then only adds the user_roles entry, leaving the homeowner-profile
    // fields intact.
    localId: "chris-morris-homeowner-dev",
    email: "morris27sky@icloud.com",
    password: "password",
    displayName: "Chris Morris",
    homeownerProfile: {
      firstName: "Chris",
      lastName: "Morris",
      username: "chris.morris",
      location: "E4",
    },
    adminProfile: true,
  },
  {
    // Local fallback admin account. Useful when QA needs an isolated
    // admin login that has no homeowner state.
    localId: "BpSvMxVYpnQeG211hiY8cNPbDCW2",
    email: "admin@example.com",
    password: "password",
    displayName: "Local Admin",
    adminProfile: true,
  },
];

async function ensureHomeownerProfiles() {
  const usersWithProfiles = EMULATOR_USERS.filter((u) => u.homeownerProfile);
  if (usersWithProfiles.length === 0) return;

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
  });

  try {
    for (const user of usersWithProfiles) {
      const p = user.homeownerProfile;
      const outward = (p.location || "").trim().toUpperCase().split(/\s+/)[0] || null;
      await conn.query(
        `INSERT INTO users (uid, email, firstName, lastName, username, locationRaw, postcodeOutward, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           email           = VALUES(email),
           firstName       = VALUES(firstName),
           lastName        = VALUES(lastName),
           username        = VALUES(username),
           locationRaw     = VALUES(locationRaw),
           postcodeOutward = VALUES(postcodeOutward)`,
        [
          user.localId,
          user.email,
          p.firstName,
          p.lastName,
          p.username || null,
          p.location || null,
          outward,
        ],
      );
      log(`Homeowner profile ensured: ${user.email}`);
    }
  } finally {
    await conn.end();
  }
}

// Aligns the seeded `pLT7...` (Elegant Building Services) tradesman row with
// the real Elegant Building Services Ltd (company_number 12758227) record so
// the mobile /matches page shows the same Google rating / review count as the
// web shortlist (which fetches via Companies House + live Google Places).
// The sim's `runScript("seed")` step writes sim-generated values for this
// account; this function overrides them after the seed completes. Errors are
// swallowed and logged so this never kills the sim.
// Idempotent upsert of every EMULATOR_USERS entry tagged with
// `adminProfile: true`: writes the users row + the user_roles 'admin' row.
// Required because preflight wipes the DB on every restart.
async function ensureAdminRole() {
  const adminUsers = EMULATOR_USERS.filter((u) => u.adminProfile);
  if (adminUsers.length === 0) return;

  const mysql2 = require("mysql2/promise");
  let conn;
  try {
    conn = await mysql2.createConnection({
      host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
      user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
      password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
      database:
        process.env.MYSQL_DATABASE ||
        process.env.TEST_DB_NAME ||
        "vetmybuilder_test_s1_4_w0",
    });

    for (const u of adminUsers) {
      // When the same EMULATOR_USERS entry also has a homeownerProfile,
      // ensureHomeownerProfiles already wrote the canonical users row -
      // including username + locationRaw fields the admin pass doesn't
      // know about. Skip the users INSERT in that case to avoid
      // clobbering them; just upsert the user_roles 'admin' row.
      if (!u.homeownerProfile) {
        const parts = String(u.displayName || "").trim().split(/\s+/);
        const firstName = parts[0] || "Admin";
        const lastName = parts.slice(1).join(" ") || "Admin";
        const username = u.email.split("@")[0];

        await conn.query(
          `INSERT INTO users (uid, email, firstName, lastName, username, createdAt)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             email = VALUES(email),
             firstName = VALUES(firstName),
             lastName  = VALUES(lastName)`,
          [u.localId, u.email, firstName, lastName, username],
        );
      }

      await conn.query(
        `INSERT IGNORE INTO user_roles (uid, role) VALUES (?, 'admin')`,
        [u.localId],
      );
    }

    log(`Admin role upserted (${adminUsers.length} user${adminUsers.length === 1 ? "" : "s"})`);
  } catch (err) {
    log(`Admin upsert skipped: ${err.message}`);
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}

// Idempotent upsert of the canonical Elegant tradesman row.
// Works in both minimal-seed (no prior runScript("seed")) and full-sim modes.
async function ensureElegantCanonical() {
  const mysql2 = require("mysql2/promise");
  let conn;
  try {
    conn = await mysql2.createConnection({
      host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
      user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
      password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
      database:
        process.env.MYSQL_DATABASE ||
        process.env.TEST_DB_NAME ||
        "vetmybuilder_test_s1_4_w0",
    });

    const ELEGANT_UID = "pLT7RLEYByX6IJWzGAMjAKrW5L93";

    // Make sure Elegant exists in the users table too (auth user lives in
    // Firebase emulator; we need the MySQL row for joins).
    await conn.query(
      `INSERT INTO users (uid, email, firstName, lastName, username, locationRaw, postcodeOutward, createdAt)
       VALUES (?, 'info@elegantbuilding.co.uk', 'Elegant', 'Building', 'elegant.building', 'E4', 'E4', NOW())
       ON DUPLICATE KEY UPDATE
         firstName = VALUES(firstName),
         lastName  = VALUES(lastName)`,
      [ELEGANT_UID],
    );

    const ELEGANT_TRADES = [
      "General Builder",
      "New Build",
      "Extension Builder",
      "Painter / Decorator",
      "Bathroom Fitter",
      "Flooring Specialist",
      "Tiler",
      "Plasterer",
      "External Wall Insulation",
      "Handyman",
      "Roofer",
      "New Kitchen Installation",
      "Kitchen Refresh (Partial)",
      "Kitchen Remodel (Full)",
    ].join(",");

    const ELEGANT_SOCIALS = JSON.stringify([
      "https://www.facebook.com/profile.php?id=100077500594253",
      "https://www.instagram.com/elegantbuildingservices/",
    ]);

    // Showcase photos pulled from elegantbuilding.co.uk (real portfolio
    // shots) so the profile feels populated end-to-end.
    const ELEGANT_PHOTO_URLS = [
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/09/Kitchen-after.jpg",
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/09/Kitchen-after-2.jpg",
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/09/Kitchen-tiles.jpg",
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/09/Bathroom-2a.jpg",
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/09/Bathroom-2b.jpg",
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/08/Wall-Insullation-10a.jpg",
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/08/After1b.jpg",
      "https://elegantbuilding.co.uk/wp-content/uploads/2024/08/Wall-Stone-1.jpg",
    ];

    const ELEGANT_ABOUT = [
      "Family-run building firm based in north-east London. We handle full kitchen and bathroom fits, external wall insulation, and end-to-end refurbs across E4 and the surrounding boroughs.",
      "Most of our work comes from word of mouth — neighbours recommending us to neighbours. We turn up when we say we will, leave the place tidier than we found it, and stand behind the work for a year after we hand the keys back.",
    ].join("\n\n");

    await conn.query(
      `INSERT INTO tradesmen
         (user_id, company_name, contact_name, phone, email,
          trade_types, service_areas,
          subscription_status, verification_status,
          company_number, ch_status, ch_name,
          google_rating, google_reviews_count,
          vmb_score, vmb_badge, status,
          web_url, social_links_json,
          photo_count, supporting_doc_count,
          warranty_months, discount_min_percent, discount_max_percent,
          offers_discount, profile_picture_url, about)
       VALUES (?, 'Elegant Building Services Ltd', 'Adam',
               '07000000000', 'info@elegantbuilding.co.uk',
               ?,
               'E1,E2,E3,E4,E5,N1,N7,NW1,SE1,SW1,W1,WC1,EC1,N4,N5,E10,E11,E17',
               'free', 'verified',
               '12758227', 'verified', 'Elegant Building Services Ltd',
               4.9, 137,
               93, 'platinum', 'active',
               'https://elegantbuilding.co.uk/', ?,
               ?, 1,
               12, 0, 5,
               1, ?, ?)
       ON DUPLICATE KEY UPDATE
         company_name = VALUES(company_name),
         trade_types = VALUES(trade_types),
         service_areas = VALUES(service_areas),
         subscription_status = VALUES(subscription_status),
         verification_status = VALUES(verification_status),
         company_number = VALUES(company_number),
         ch_status = VALUES(ch_status),
         ch_name = VALUES(ch_name),
         google_rating = VALUES(google_rating),
         google_reviews_count = VALUES(google_reviews_count),
         vmb_score = VALUES(vmb_score),
         vmb_badge = VALUES(vmb_badge),
         status = VALUES(status),
         web_url = VALUES(web_url),
         social_links_json = VALUES(social_links_json),
         photo_count = VALUES(photo_count),
         supporting_doc_count = VALUES(supporting_doc_count),
         warranty_months = VALUES(warranty_months),
         discount_min_percent = VALUES(discount_min_percent),
         discount_max_percent = VALUES(discount_max_percent),
         offers_discount = VALUES(offers_discount),
         profile_picture_url = VALUES(profile_picture_url),
         about = VALUES(about)`,
      [
        ELEGANT_UID,
        ELEGANT_TRADES,
        ELEGANT_SOCIALS,
        ELEGANT_PHOTO_URLS.length,
        ELEGANT_PHOTO_URLS[0],
        ELEGANT_ABOUT,
      ],
    );

    // Replace photos so we don't accumulate duplicates across restarts.
    await conn.query(`DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`, [ELEGANT_UID]);
    for (let i = 0; i < ELEGANT_PHOTO_URLS.length; i++) {
      await conn.query(
        `INSERT INTO tradesmen_photos (tradesman_user_id, url, sort_order)
         VALUES (?, ?, ?)`,
        [ELEGANT_UID, ELEGANT_PHOTO_URLS[i], i],
      );
    }

    // Elegant ships unsubscribed in the dev seed - subscription state is
    // managed manually (admin UI, billing flow, or direct SQL) so test
    // paths can exercise both "subscribed" and "unsubscribed" branches
    // without seed churn.
    await conn.query(
      `DELETE FROM builder_subscriptions WHERE user_id = ?`,
      [ELEGANT_UID],
    );

    // Insurance placeholder PDF lives at web/public/seed-files - served
    // by Next.js at /seed-files/elegant-insurance-placeholder.pdf.
    await conn.query(
      `DELETE FROM tradesmen_insurance_policies WHERE user_id = ?`,
      [ELEGANT_UID],
    );
    await conn.query(
      `INSERT INTO tradesmen_insurance_policies
         (user_id, provider, policy_number, coverage_type,
          public_liability_pennies, certificate_path, verified_status)
       VALUES (?, 'Placeholder Insurance Co.', 'POL-DEV-0001',
               'public_liability', 200000000,
               '/seed-files/elegant-insurance-placeholder.pdf', 'queued')`,
      [ELEGANT_UID],
    );

    log("Elegant canonical upserted (with photos + insurance + socials)");
  } catch (err) {
    log(`Elegant upsert skipped: ${err.message}`);
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}

// Idempotent upsert of the canonical Pimlico Plumbers tradesman row.
// Real London plumbing firm (founded 1979, HQ Lambeth/Pimlico). Used as a
// second seeded tradesperson so the dev environment isn't a one-builder
// world - useful for testing shortlists, messaging dock, comparison views.
async function ensurePimlicoCanonical() {
  const mysql2 = require("mysql2/promise");
  let conn;
  try {
    conn = await mysql2.createConnection({
      host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
      user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
      password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
      database:
        process.env.MYSQL_DATABASE ||
        process.env.TEST_DB_NAME ||
        "vetmybuilder_test_s1_4_w0",
    });

    const PIMLICO_UID = "pimlico-plumbers-tradesman-dev";

    await conn.query(
      `INSERT INTO users (uid, email, firstName, lastName, username, locationRaw, postcodeOutward, createdAt)
       VALUES (?, 'info@pimlicoplumbers.com', 'Scott', 'Mullins', 'pimlico.plumbers', 'SE11', 'SE11', NOW())
       ON DUPLICATE KEY UPDATE
         firstName = VALUES(firstName),
         lastName  = VALUES(lastName)`,
      [PIMLICO_UID],
    );

    const PIMLICO_TRADES = [
      "Plumber",
      "Gas Engineer",
      "Heating Engineer",
      "Boiler Installer",
      "Drainage Specialist",
      "Bathroom Fitter",
      "Electrician",
      "Bathroom Refresh (Partial)",
      "Bathroom Remodel (Full)",
      "New Bathroom Installation",
    ].join(",");

    const PIMLICO_SOCIALS = JSON.stringify([
      "https://www.facebook.com/PimlicoPlumbers",
      "https://www.instagram.com/pimlicoplumbers/",
      "https://twitter.com/pimlicoplumbers",
      "https://www.linkedin.com/company/pimlico-plumbers/",
      "https://www.youtube.com/user/PimlicoPlumbersLtd",
    ]);

    // Local job-image stock photos so the gallery renders without external
    // network dependency. Swap for real Pimlico portfolio shots if/when
    // their site exposes stable image URLs.
    const PIMLICO_PHOTO_URLS = [
      "/job-images/plumbing.jpg",
      "/job-images/heating-and-cooling.jpg",
      "/job-images/bathroom.jpg",
      "/job-images/kitchen.jpg",
      "/job-images/electrical.jpg",
      "/job-images/repairs-and-maintenance.jpg",
    ];

    const PIMLICO_ABOUT = [
      "London's largest independent plumbing and heating service. Engineers on call across all 32 boroughs, with a fleet of branded vans and a 24/7 dispatch team for emergencies.",
      "We've been a family-run firm since 1979 and put every engineer through our in-house training before they get behind the wheel. Plumbing, heating, drains, electrical and bathroom fits — done properly first time.",
    ].join("\n\n");

    await conn.query(
      `INSERT INTO tradesmen
         (user_id, company_name, contact_name, phone, email,
          trade_types, service_areas,
          subscription_status, verification_status,
          company_number, ch_status, ch_name,
          google_rating, google_reviews_count,
          vmb_score, vmb_badge, status,
          web_url, social_links_json,
          photo_count, supporting_doc_count,
          warranty_months, discount_min_percent, discount_max_percent,
          offers_discount, profile_picture_url, about)
       VALUES (?, 'Pimlico Plumbers Ltd', 'Scott Mullins',
               '02079288888', 'info@pimlicoplumbers.com',
               ?,
               'SE1,SE5,SE11,SE15,SE17,SW1,SW3,SW6,SW7,SW8,SW11,W1,W2,W6,W11,WC1,WC2,EC1,EC2,N1,NW1,NW3,NW8,E1,E2,E8,E14',
               'free', 'verified',
               '02437437', 'verified', 'PIMLICO PLUMBERS LIMITED',
               4.7, 5800,
               91, 'platinum', 'active',
               'https://www.pimlicoplumbers.com/', ?,
               ?, 1,
               12, 0, 10,
               1, ?, ?)
       ON DUPLICATE KEY UPDATE
         company_name = VALUES(company_name),
         trade_types = VALUES(trade_types),
         service_areas = VALUES(service_areas),
         subscription_status = VALUES(subscription_status),
         verification_status = VALUES(verification_status),
         company_number = VALUES(company_number),
         ch_status = VALUES(ch_status),
         ch_name = VALUES(ch_name),
         google_rating = VALUES(google_rating),
         google_reviews_count = VALUES(google_reviews_count),
         vmb_score = VALUES(vmb_score),
         vmb_badge = VALUES(vmb_badge),
         status = VALUES(status),
         web_url = VALUES(web_url),
         social_links_json = VALUES(social_links_json),
         photo_count = VALUES(photo_count),
         supporting_doc_count = VALUES(supporting_doc_count),
         warranty_months = VALUES(warranty_months),
         discount_min_percent = VALUES(discount_min_percent),
         discount_max_percent = VALUES(discount_max_percent),
         offers_discount = VALUES(offers_discount),
         profile_picture_url = VALUES(profile_picture_url),
         about = VALUES(about)`,
      [
        PIMLICO_UID,
        PIMLICO_TRADES,
        PIMLICO_SOCIALS,
        PIMLICO_PHOTO_URLS.length,
        PIMLICO_PHOTO_URLS[0],
        PIMLICO_ABOUT,
      ],
    );

    await conn.query(`DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`, [PIMLICO_UID]);
    for (let i = 0; i < PIMLICO_PHOTO_URLS.length; i++) {
      await conn.query(
        `INSERT INTO tradesmen_photos (tradesman_user_id, url, sort_order)
         VALUES (?, ?, ?)`,
        [PIMLICO_UID, PIMLICO_PHOTO_URLS[i], i],
      );
    }

    await conn.query(
      `DELETE FROM builder_subscriptions WHERE user_id = ?`,
      [PIMLICO_UID],
    );

    await conn.query(
      `DELETE FROM tradesmen_insurance_policies WHERE user_id = ?`,
      [PIMLICO_UID],
    );
    await conn.query(
      `INSERT INTO tradesmen_insurance_policies
         (user_id, provider, policy_number, coverage_type,
          public_liability_pennies, certificate_path, verified_status)
       VALUES (?, 'Placeholder Insurance Co.', 'POL-PIMLICO-DEV-0001',
               'public_liability', 1000000000,
               '/seed-files/elegant-insurance-placeholder.pdf', 'queued')`,
      [PIMLICO_UID],
    );

    log("Pimlico canonical upserted (with photos + insurance + socials)");
  } catch (err) {
    log(`Pimlico upsert skipped: ${err.message}`);
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}

// Idempotent upsert of 20 demo projects owned by Chris (homeowner). The
// first 15 align with Elegant's trade_types so they surface in Elegant's
// swipe deck; the last 5 (cleaning + pest control) intentionally do not.
// Each project gets a unique E4 postcode so the location filter has
// something to bite on. Re-runs are safe: rows are matched by
// (ownerUserId, name) and updated in place; classification rows are
// rebuilt each run from the seed data.
async function ensureSeedProjects() {
  const OWNER_UID = "chris-morris-homeowner-dev";
  const SEED_TAG = "dev-fixtures-v1";

  // Mapping from approximate budget tier to a price band the AI ranker
  // / homeowner UI can render. Keeps the surfaced "Estimated cost" badge
  // varied across the deck.
  const BAND = {
    low:    { low_pence: 80000,    high_pence: 350000 },
    mid:    { low_pence: 350000,   high_pence: 900000 },
    high:   { low_pence: 900000,   high_pence: 2500000 },
    xhigh:  { low_pence: 2500000,  high_pence: 6000000 },
  };

  const SEED_PROJECTS = [
    // ----- 5 Insulation (matches Elegant via "External Wall Insulation") -----
    {
      name: "External wall insulation for end-of-terrace",
      type: "External Wall Insulation",
      postcode: "E4 6AA",
      description: "Timeframe: Within 2 months. Budget: £15k-£30k. Materials: EPS render system, mesh, basecoat, topcoat in soft white.",
      propertyType: "Terraced", bedrooms: 3,
      area_m2: 90, urgency: "soon", band: "high",
    },
    {
      name: "Cavity wall insulation full house",
      type: "Cavity Wall Insulation",
      postcode: "E4 6BD",
      description: "Timeframe: Next 3 weeks. Budget: £1k-£3k. Materials: Bonded bead cavity fill, certified installer required.",
      propertyType: "Semi-detached", bedrooms: 4,
      area_m2: 110, urgency: "soon", band: "low",
    },
    {
      name: "Loft insulation top-up to current standard",
      type: "Loft Insulation",
      postcode: "E4 6QH",
      description: "Timeframe: Flexible. Budget: £500-£1.5k. Materials: 270mm mineral wool roll, loft boarding over walkway.",
      propertyType: "Semi-detached", bedrooms: 3,
      area_m2: 60, urgency: "flexible", band: "low",
    },
    {
      name: "Floor insulation for ground-floor lounge",
      type: "Floor Insulation",
      postcode: "E4 7AA",
      description: "Timeframe: Within a month. Budget: £2k-£5k. Materials: PIR boards between joists, vapour membrane, lift and relay floorboards.",
      propertyType: "Terraced", bedrooms: 2,
      area_m2: 30, urgency: "soon", band: "mid",
    },
    {
      name: "Underfloor insulation suspended timber floor",
      type: "Underfloor Insulation",
      postcode: "E4 7HF",
      description: "Timeframe: Next 6 weeks. Budget: £3k-£6k. Materials: Mineral wool batts in netting, breathable membrane, full house ground floor.",
      propertyType: "Detached", bedrooms: 4,
      area_m2: 75, urgency: "flexible", band: "mid",
    },

    // ----- 4 Kitchen (matches Elegant via "New Kitchen Installation" etc.) -----
    {
      name: "New kitchen installation - L-shaped layout",
      type: "New Kitchen Installation",
      postcode: "E4 7BS",
      description: "Timeframe: Within 2 months. Budget: £15k-£30k. Materials: Howdens Greenwich shaker, quartz worktops, integrated Bosch appliances.",
      propertyType: "Terraced", bedrooms: 3,
      urgency: "soon", band: "high",
    },
    {
      name: "Kitchen refresh - paint cabinets and replace worktops",
      type: "Kitchen Refresh (Partial)",
      postcode: "E4 7JT",
      description: "Timeframe: Within 4 weeks. Budget: £3k-£6k. Materials: Cabinet respray Farrow & Ball Hague Blue, laminate worktop, new handles.",
      propertyType: "Flat", bedrooms: 2,
      urgency: "soon", band: "mid",
    },
    {
      name: "Full kitchen remodel - knock through to dining room",
      type: "Kitchen Remodel (Full)",
      postcode: "E4 8AB",
      description: "Timeframe: 3-4 months. Budget: £30k-£60k. Materials: Bespoke shaker, granite island, RSJ for opening, induction hob and double oven.",
      propertyType: "Semi-detached", bedrooms: 4,
      urgency: "flexible", band: "xhigh",
    },
    {
      name: "Kitchen splashback tiling - metro tiles",
      type: "Kitchen Tiling & Splashback",
      postcode: "E4 8RY",
      description: "Timeframe: Within 2 weeks. Budget: £500-£1.5k. Materials: White bevelled metro tiles, dark grey grout, 4m run plus return.",
      propertyType: "Terraced", bedrooms: 2,
      urgency: "urgent", band: "low",
    },

    // ----- 6 Bathroom (matches Elegant via "Bathroom Fitter") -----
    {
      name: "Bathroom refresh - new suite same layout",
      type: "Bathroom Refresh (Partial)",
      postcode: "E4 8DJ",
      description: "Timeframe: Within 6 weeks. Budget: £3k-£6k. Materials: Roca close-coupled WC, basin and pedestal, P-shape bath, chrome thermostatic shower.",
      propertyType: "Flat", bedrooms: 1,
      urgency: "soon", band: "mid",
    },
    {
      name: "Full bathroom remodel - move bath, add shower enclosure",
      type: "Bathroom Remodel (Full)",
      postcode: "E4 9AT",
      description: "Timeframe: Within 2 months. Budget: £6k-£15k. Materials: Walk-in shower enclosure, freestanding bath, vanity unit, large-format porcelain tiles.",
      propertyType: "Semi-detached", bedrooms: 3,
      urgency: "soon", band: "high",
    },
    {
      name: "New bathroom installation in loft conversion",
      type: "New Bathroom Installation",
      postcode: "E4 9JJ",
      description: "Timeframe: 4-6 weeks. Budget: £6k-£15k. Materials: Compact suite, electric shower, Velux roof light, full waterproofing.",
      propertyType: "Detached", bedrooms: 4,
      urgency: "flexible", band: "high",
    },
    {
      name: "Bathroom wall and floor tiling",
      type: "Bathroom Tiling",
      postcode: "E4 9JB",
      description: "Timeframe: Within 3 weeks. Budget: £1k-£3k. Materials: 600x300 marble-effect porcelain on walls, 300x300 anti-slip on floor, anthracite grout.",
      propertyType: "Terraced", bedrooms: 2,
      urgency: "soon", band: "low",
    },
    {
      name: "Wet room conversion ground floor",
      type: "Wet Room Installation",
      postcode: "E4 9DH",
      description: "Timeframe: Within 8 weeks. Budget: £6k-£15k. Materials: Linear drain, full tank waterproofing, glass screen, accessible thermostatic shower.",
      propertyType: "Bungalow", bedrooms: 2,
      urgency: "flexible", band: "high",
    },
    {
      name: "Replace bathroom flooring with LVT",
      type: "Bathroom Flooring",
      postcode: "E4 7BE",
      description: "Timeframe: Within 2 weeks. Budget: £500-£1.5k. Materials: Karndean Knight Tile LVT, plywood subfloor, silicone perimeter seal.",
      propertyType: "Flat", bedrooms: 1,
      urgency: "urgent", band: "low",
    },

    // ----- 5 Unrelated (will not match Elegant) -----
    {
      name: "Oven deep clean before tenancy inspection",
      type: "Oven Cleaning",
      postcode: "E4 6PH",
      description: "Timeframe: This week. Budget: £80-£200. Materials: N/A - bring own non-caustic cleaning kit, single fan oven plus hob.",
      propertyType: "Flat", bedrooms: 2,
      urgency: "urgent", band: "low",
    },
    {
      name: "Carpet cleaning living room and stairs",
      type: "Carpet Cleaning",
      postcode: "E4 7BT",
      description: "Timeframe: Within 2 weeks. Budget: £100-£300. Materials: Hot water extraction, pet-safe products, two pet stains in living room.",
      propertyType: "Terraced", bedrooms: 3,
      urgency: "soon", band: "low",
    },
    {
      name: "End of tenancy clean for 2-bed flat",
      type: "End-of-Tenancy Cleaning",
      postcode: "E4 8NJ",
      description: "Timeframe: Friday this week. Budget: £200-£400. Materials: Full deep clean inc. oven, fridge, inside cupboards, professional standard checklist.",
      propertyType: "Flat", bedrooms: 2,
      urgency: "urgent", band: "low",
    },
    {
      name: "Gutter clean and downpipe check whole house",
      type: "Gutter Cleaning",
      postcode: "E4 6JN",
      description: "Timeframe: Within 2 weeks. Budget: £80-£200. Materials: Vacuum system, photo report of any cracked sections.",
      propertyType: "Semi-detached", bedrooms: 3,
      urgency: "soon", band: "low",
    },
    {
      name: "Mouse infestation in kitchen and loft",
      type: "Mouse/Rat Control",
      postcode: "E4 9FG",
      description: "Timeframe: This week. Budget: £150-£400. Materials: Bait stations, entry-point sealing, two follow-up visits.",
      propertyType: "Terraced", bedrooms: 3,
      urgency: "urgent", band: "low",
    },
  ];

  // Map relative budget descriptor to a clean string for the price-band
  // estimate. The PriceRangeBadge prefers the low-high pence pair, so
  // those go in the structured JSON; this label is just human-readable
  // backup for any consumer that wants a string.
  function bandLabel(band) {
    const b = BAND[band];
    return `£${(b.low_pence / 100).toLocaleString("en-GB")} - £${(b.high_pence / 100).toLocaleString("en-GB")}`;
  }

  const mysql2 = require("mysql2/promise");
  let conn;
  try {
    conn = await mysql2.createConnection({
      host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
      user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
      password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
      database:
        process.env.MYSQL_DATABASE ||
        process.env.TEST_DB_NAME ||
        "vetmybuilder_test_s1_4_w0",
    });

    let inserted = 0;
    let updated = 0;

    for (const p of SEED_PROJECTS) {
      const answers = {
        _seed: SEED_TAG,
        ...(p.area_m2 ? { insulation: { area_m2: p.area_m2 } } : {}),
      };
      const answersJson = JSON.stringify(answers);

      // Match-or-create by (ownerUserId, name).
      const [existing] = await conn.query(
        `SELECT id FROM projects WHERE ownerUserId = ? AND name = ? LIMIT 1`,
        [OWNER_UID, p.name],
      );

      let projectId;
      if (existing.length > 0) {
        projectId = existing[0].id;
        await conn.query(
          `UPDATE projects
              SET type = ?, location = ?, description = ?,
                  answers_json = ?, propertyType = ?, bedrooms = ?,
                  status = 'live'
            WHERE id = ?`,
          [p.type, p.postcode, p.description, answersJson, p.propertyType, p.bedrooms, projectId],
        );
        updated++;
      } else {
        const [res] = await conn.query(
          `INSERT INTO projects
             (name, type, location, description, answers_json,
              propertyType, bedrooms, ownerUserId, status, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live', NOW())`,
          [p.name, p.type, p.postcode, p.description, answersJson, p.propertyType, p.bedrooms, OWNER_UID],
        );
        projectId = res.insertId;
        inserted++;
      }

      // Rebuild classification so it always matches the seed data.
      // price_band_estimate is consumed as a *string* by the API enricher
      // (see server/routes/projects/projects.get.js — it does
      // String(parsed.price_band_estimate).trim()). Storing an object
      // here renders as "[object Object]" in the Guide pill.
      const structured = {
        type: p.type,
        scope: "medium",
        complexity: "moderate",
        urgency: p.urgency,
        materials: [],
        recommended_trades: [p.type],
        key_concerns: ["quality of finish"],
        summary: p.description,
        price_band_estimate: bandLabel(p.band),
      };

      await conn.query(
        `DELETE FROM project_classifications WHERE project_id = ?`,
        [projectId],
      );
      await conn.query(
        `INSERT INTO project_classifications
           (project_id, classifier_version, raw_description, structured)
         VALUES (?, 'seed-v1', ?, ?)`,
        [projectId, p.description, JSON.stringify(structured)],
      );
    }

    log(`Seed projects ensured (${inserted} new, ${updated} updated)`);
  } catch (err) {
    log(`Seed projects skipped: ${err.message}`);
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}

// Re-applies scripts/seed-chris-matches.sql on every boot so Chris's dev
// account always has 2 projects + 6 swipe_interest rows (2 pending, 2 matched,
// 2 declined_by_builder). The SQL file is idempotent (INSERT ... ON DUPLICATE
// KEY UPDATE, plus NOT EXISTS guards on project name), so running it on every
// restart is safe. The sim's seed step recreates projects, which wipes our
// rows — this function restores them.
async function ensureChrisMatches() {
  const sqlPath = path.join(__dirname, "seed-chris-matches.sql");
  let sql;
  try {
    sql = fs.readFileSync(sqlPath, "utf8");
  } catch (e) {
    log(`Chris matches seed skipped: cannot read ${sqlPath}: ${e.message}`);
    return;
  }

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
    // Required so the whole seed file (SET @var, multiple INSERTs, SELECTs)
    // runs in one session over a single round-trip. Local-dev only.
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    log("Chris matches seeded");
  } catch (e) {
    log(`Chris matches seed skipped: ${e.message}`);
  } finally {
    await conn.end();
  }
}

// Re-applies scripts/seed-chris-bathroom-project.sql on every boot so Chris's
// dev account always has a substantial bathroom project for AI-ranker testing:
// 1 published project + classification, 10 recommendations (5 relevant trades,
// 5 irrelevant), 15 tradesmen rows, 5 active builder_subscriptions.
// Idempotent — same pattern as ensureChrisMatches().
async function ensureChrisBathroomProject() {
  const sqlPath = path.join(__dirname, "seed-chris-bathroom-project.sql");
  let sql;
  try {
    sql = fs.readFileSync(sqlPath, "utf8");
  } catch (e) {
    log(`Chris bathroom seed skipped: cannot read ${sqlPath}: ${e.message}`);
    return;
  }

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
    await conn.query(sql);
    log("Chris bathroom project seeded");
  } catch (e) {
    log(`Chris bathroom seed skipped: ${e.message}`);
  } finally {
    await conn.end();
  }
}

// Runs scripts/backfill-project-classifications.js as a child process. We run
// it as a subprocess so any LLM/HTTP setup it does (dotenv loading, retries,
// long timeouts) stays isolated from this orchestrator.
function runBackfillClassifications() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      ["scripts/backfill-project-classifications.js"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let buf = "";
    child.stdout.on("data", (d) => (buf += d.toString()));
    child.stderr.on("data", (d) => (buf += d.toString()));
    child.on("exit", (code) => {
      if (code === 0) {
        const summary = buf
          .trim()
          .split("\n")
          .find((l) => /price band|already have/i.test(l));
        log(summary || "Classification backfill complete");
        resolve();
      } else {
        reject(new Error(`backfill exited with code ${code}\n${buf}`));
      }
    });
    child.on("error", reject);
  });
}

async function ensureEmulatorUsers() {
  const emulatorHost =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const projectId = process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    "vetmybuilder";
  const base = `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/projects/${projectId}`;

  for (const user of EMULATOR_USERS) {
    try {
      const res = await fetch(`${base}/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer owner",
        },
        body: JSON.stringify({ ...user, emailVerified: true }),
      });
      if (res.ok) {
        log(`Emulator user ensured: ${user.email}`);
      } else {
        const body = await res.json().catch(() => ({}));
        // DUPLICATE_EMAIL means user already exists — that's fine
        if (body?.error?.message !== "DUPLICATE_EMAIL") {
          log(`Warning: could not create emulator user ${user.email}: ${body?.error?.message}`);
        }
      }
    } catch (e) {
      log(`Warning: emulator user creation skipped (${user.email}): ${e.message}`);
    }
  }
}

function runScript(script, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      ["scripts/simulate.js", script],
      {
        stdio: "inherit",
        env: { ...process.env, ...env },
      }
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`simulate.js ${script} exited with code ${code}`));
    });
  });
}

(async () => {
  log("Waiting for API server...");
  const ready = await waitForServer();
  if (!ready) {
    log("Server did not become ready in time — skipping sim autostart");
    process.exit(1);
  }

  // Ensure known real-account test users exist in the emulator
  await ensureEmulatorUsers();

  // Upsert MySQL profile rows for real homeowner accounts
  try {
    await ensureHomeownerProfiles();
  } catch (e) {
    log(`Warning: failed to ensure homeowner profiles: ${e.message}`);
  }

  // FULL_SIM=1 brings back the noisy seed (lots of fake builders + projects +
  // recommendations + a daemon that creates more activity continuously).
  // Default is the minimal seed: just the canonical Elegant tradesman so the
  // homeowner can create a project and see Elegant surface in the matching
  // pipeline, and Elegant can swipe back. No noise.
  const FULL_SIM = process.env.FULL_SIM === "1";

  if (FULL_SIM) {
    log("Server ready. Running full sim seed...");
    try {
      await runScript("seed");
    } catch (e) {
      log(`Seed failed: ${e.message}`);
      process.exit(1);
    }

    try {
      await ensureChrisMatches();
    } catch (e) {
      log(`Warning: failed to seed Chris matches: ${e.message}`);
    }

    try {
      await ensureChrisBathroomProject();
    } catch (e) {
      log(`Warning: failed to seed Chris bathroom project: ${e.message}`);
    }

    try {
      await runBackfillClassifications();
    } catch (e) {
      log(`Warning: classification backfill failed: ${e.message}`);
    }
  } else {
    log("Server ready. Minimal seed (FULL_SIM=1 to enable full sim).");
  }

  // Always upsert the canonical Elegant tradesman row.
  try {
    await ensureElegantCanonical();
  } catch (e) {
    log(`Warning: failed to upsert Elegant canonical: ${e.message}`);
  }

  // Always upsert the canonical Pimlico Plumbers tradesman row.
  try {
    await ensurePimlicoCanonical();
  } catch (e) {
    log(`Warning: failed to upsert Pimlico canonical: ${e.message}`);
  }

  // Always upsert the local admin row + role so /admin works after wipe.
  try {
    await ensureAdminRole();
  } catch (e) {
    log(`Warning: failed to upsert admin role: ${e.message}`);
  }

  // Seed 20 demo projects owned by Chris (15 matching Elegant + 5 unrelated).
  // Idempotent - runs on every restart whether FULL_SIM is on or off.
  try {
    await ensureSeedProjects();
  } catch (e) {
    log(`Warning: failed to seed projects: ${e.message}`);
  }

  if (!FULL_SIM) {
    log("Minimal seed complete. Skipping daemon.");
    return;
  }

  log("Seed complete. Starting daemon...");
  // Daemon runs forever - inherit its stdio so logs appear in the terminal
  const daemon = spawn("node", ["scripts/simulate.js", "daemon"], {
    stdio: "inherit",
    env: { ...process.env, SIM_MODE: "auto" },
  });

  // Continuously boost any new Elegant recommendations.
  // The daemon creates recs asynchronously on new projects, so we keep polling.
  setInterval(async () => {
    try {
      const mysql2 = require("mysql2/promise");
      const conn = await mysql2.createConnection({
        host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
        port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
        user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
        password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || process.env.TEST_DB_NAME || "vetmybuilder_test_s1_4_w0",
      });
      try {
        // Find Elegant recs that haven't been boosted yet
        const [unboosted] = await conn.query(`
          SELECT r.id, r.projectId FROM recommendations r
          WHERE r.company LIKE '%Elegant%'
            AND r.id NOT IN (
              SELECT DISTINCT CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(userId, '-', 3), '-', -1) AS UNSIGNED)
              FROM recommendation_votes WHERE userId LIKE 'elegant-boost-%'
            )
        `);
        if (unboosted.length === 0) return;

        // Friend source on all Elegant recs (but preserve pipeline recs)
        await conn.query("UPDATE recommendations SET source = 'magic' WHERE company LIKE '%Elegant%' AND source != 'pipeline'");

        // 15 likes per unboosted rec + CH verification (no hires — test those manually)
        for (const rec of unboosted) {
          for (let v = 0; v < 15; v++) {
            await conn.query(
              "INSERT IGNORE INTO recommendation_votes (recommendationId, userId, value, createdAt, updatedAt) VALUES (?, ?, 1, NOW(), NOW())",
              [rec.id, `elegant-boost-${rec.id}-${v}`]
            ).catch(() => {});
          }

          await conn.query(
            "INSERT IGNORE INTO company_verifications (recommendationId, status, companyNumber, companyName, score, checkedAt) VALUES (?, 'verified', '12758227', 'ELEGANT BUILDING SERVICES LTD', 95, NOW())",
            [rec.id]
          ).catch(() => {});
        }

        log(`Elegant boost: ${unboosted.length} new recs boosted (15 likes + CH verified each)`);
      } finally {
        await conn.end();
      }
    } catch (e) {
      log(`Elegant boost error: ${e.message}`);
    }
  }, 10_000);

  daemon.on("exit", (code) => process.exit(code ?? 0));
})();
