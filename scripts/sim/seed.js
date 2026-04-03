"use strict";

const fs = require("fs");
const path = require("path");
const { BOT_UIDS, getAdminUid, getApiBase } = require("./config");
const { getAuthHeaders, apiGet, apiPost, apiPut } = require("./api-client");
const { readState, writeState } = require("./state");
const builders = require("./fixtures/builders.json");
const neighbours = require("./fixtures/neighbours.json");
const completedProjectFixtures = require("./fixtures/completed-projects.json");
const comments = require("./fixtures/comments.json");

const BUILDER_PHOTOS_DIR = path.resolve(__dirname, "fixtures/builder-photos");

function randomComment() {
  return comments[Math.floor(Math.random() * comments.length)];
}

/** Pick up to `max` photos from BUILDER_PHOTOS_DIR, skipping any that don't exist. */
function pickClosurePhotos(max) {
  if (!fs.existsSync(BUILDER_PHOTOS_DIR)) return [];
  return fs
    .readdirSync(BUILDER_PHOTOS_DIR)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .slice(0, max)
    .map((f) => path.join(BUILDER_PHOTOS_DIR, f));
}

async function uploadClosurePhotos(projectId, ownerUid, count) {
  const files = pickClosurePhotos(count);
  if (!files.length) return;

  const form = new FormData();
  for (const filePath of files) {
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    form.append("photos", new Blob([fs.readFileSync(filePath)], { type: mime }), filename);
  }

  const authHeaders = await getAuthHeaders(ownerUid);
  const res = await fetch(`${getApiBase()}/api/projects/${projectId}/close/photos`, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Closure photo upload failed for project ${projectId}: ${res.status} ${body}`);
  }
}

/**
 * Upload local photo files for a builder via POST /api/tradesmen/upload-photos.
 * Returns an array of server URLs (e.g. ["/uploads/tradesmen/sim-builder-006_xxx.jpeg"]).
 */
async function uploadBuilderPhotos(uid, filenames) {
  const form = new FormData();
  let fileCount = 0;
  for (const filename of filenames) {
    const filePath = path.join(BUILDER_PHOTOS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ! Photo file not found, skipping: ${filePath}`);
      continue;
    }
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    const blob = new Blob([fs.readFileSync(filePath)], { type: mime });
    form.append("photos", blob, filename);
    fileCount++;
  }

  // No local files found — caller should fall back to photoUrls
  if (fileCount === 0) return [];

  const authHeaders = await getAuthHeaders(uid);
  const res = await fetch(`${getApiBase()}/api/tradesmen/upload-photos`, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Photo upload failed for ${uid}: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.urls || [];
}

function assertGuards() {
  if (process.env.ENABLE_TEST_ROUTES !== "1")
    throw new Error("ENABLE_TEST_ROUTES=1 must be set");
  // SIM_PROD=1: running against live Firebase/MySQL — skip emulator + NODE_ENV checks
  if (process.env.SIM_PROD !== "1") {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST)
      throw new Error("FIREBASE_AUTH_EMULATOR_HOST must be set (or use SIM_PROD=1 for production)");
    if (process.env.NODE_ENV === "production")
      throw new Error("Cannot run simulation in production (or use SIM_PROD=1 to allow it)");
  }
  if (!getAdminUid())
    throw new Error("TEST_ADMIN_USER_UID must be set");
}

function dbConfig() {
  return {
    host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
    database:
      process.env.MYSQL_DATABASE ||
      process.env.TEST_DB_NAME ||
      "vetmybuilder_test_s1_4_w0",
  };
}

async function seedBuilders(adminUid) {
  console.log("\n[seed] Seeding builders...");
  const mysql2 = require("mysql2/promise");

  for (let i = 0; i < BOT_UIDS.builders.length; i++) {
    const uid = BOT_UIDS.builders[i];
    const profile = builders[i];

    // Idempotency check — only skip join+activate if already an active tradesman.
    // Always re-run the profile patch (step 4) so fixtures stay in sync.
    const check = await apiGet("/api/tradesmen/me", uid);
    const checkData = check.ok ? await check.json().catch(() => ({})) : {};
    const alreadyActive = checkData.role === "tradesman" && !!checkData.profile;

    if (!alreadyActive) {
      // Step 1: Mint token to ensure the Firebase auth user exists in the emulator
      await mintToken(uid);

      // Step 2: Join as a lead (no auth required). This creates a lead_* row
      // in the tradesmen table which the admin can then promote.
      const joinRes = await apiPost("/api/tradesmen/join", profile);
      if (!joinRes.ok && joinRes.status !== 201) {
        const body = await joinRes.text().catch(() => "");
        throw new Error(`join failed for ${uid}: ${joinRes.status} ${body}`);
      }
      const joinData = await joinRes.json();
      const leadId = joinData.id;
      if (!leadId) throw new Error(`join returned no id for ${uid}`);
      console.log(`  + ${uid} joined as lead ${leadId} (${profile.companyName})`);

      // Step 3: Activate and assign to the bot UID.
      const activateRes = await apiPost(
        `/api/admin/tradesmen/${leadId}/status`,
        { status: "active", assignTo: uid },
        adminUid
      );
      if (!activateRes.ok) {
        const body = await activateRes.text().catch(() => "");
        throw new Error(`activate failed for ${uid}: ${activateRes.status} ${body}`);
      }
      console.log(`  ✓ ${uid} activated and assigned`);
    } else {
      console.log(`  ~ ${uid} already active — re-patching profile`);
    }

    // Step 4: Resolve photos — prefer local files, fall back to photoUrls from fixture
    let photoUrls = profile.photoUrls || [];
    let profilePictureUrl = profile.profilePictureUrl || photoUrls[0] || null;

    if (profile.photoFiles && profile.photoFiles.length > 0) {
      const uploaded = await uploadBuilderPhotos(uid, profile.photoFiles);
      if (uploaded.length > 0) {
        photoUrls = uploaded;
        const picIdx = profile.profilePictureFile
          ? profile.photoFiles.indexOf(profile.profilePictureFile)
          : -1;
        profilePictureUrl =
          picIdx >= 0 && uploaded[picIdx] ? uploaded[picIdx] : uploaded[0] || null;
        console.log(`  ✓ ${uid} local photos uploaded (${photoUrls.length})`);
      }
      // else: silently use photoUrls fallback already set above
    }

    // Step 5: Write phone, photos, and profile picture directly to the DB.
    // This is simpler and more reliable than going through PUT /api/tradesmen/me
    // which has token/auth machinery that can fail silently.
    const conn = await mysql2.createConnection(dbConfig());
    try {
      const tradeTypes = Array.isArray(profile.tradeTypes)
        ? profile.tradeTypes.join(",")
        : profile.tradeTypes || "";
      const serviceAreas = Array.isArray(profile.serviceAreas)
        ? profile.serviceAreas.join(",")
        : profile.serviceAreas || "";

      await conn.query(
        `UPDATE tradesmen SET
           phone                = ?,
           email                = ?,
           contact_name         = ?,
           trade_types          = ?,
           service_areas        = ?,
           web_url              = ?,
           discount_min_percent = ?,
           discount_max_percent = ?,
           offers_discount      = ?,
           warranty_months      = ?,
           photo_count          = ?,
           supporting_doc_count = ?,
           profile_picture_url  = ?,
           updated_at           = NOW()
         WHERE user_id = ?`,
        [
          profile.phone || null,
          profile.email || null,
          profile.contactName || null,
          tradeTypes,
          serviceAreas,
          profile.website || null,
          profile.discountMin || 0,
          profile.discountMax || 0,
          profile.discountMin || profile.discountMax ? 1 : 0,
          profile.warrantyMonths || 0,
          photoUrls.length,
          profile.supportingDocCount || 0,
          profilePictureUrl,
          uid,
        ]
      );

      // Replace photos
      await conn.query(
        `DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`,
        [uid]
      );
      for (let idx = 0; idx < photoUrls.length; idx++) {
        await conn.query(
          `INSERT INTO tradesmen_photos (tradesman_user_id, url, sort_order) VALUES (?, ?, ?)`,
          [uid, photoUrls[idx], idx]
        );
      }

      console.log(
        `  ✓ ${uid} profile patched — phone: ${profile.phone || "none"}, photos: ${photoUrls.length}`
      );
    } finally {
      await conn.end();
    }
  }
}

async function seedNeighbours() {
  console.log("\n[seed] Seeding neighbours...");

  for (let i = 0; i < BOT_UIDS.neighbours.length; i++) {
    const uid = BOT_UIDS.neighbours[i];
    const neighbour = neighbours[i];

    // Idempotency check — skip if account already exists
    const check = await apiGet("/api/me", uid);
    if (check.ok) {
      console.log(`  ✓ ${uid} already exists — skipping`);
      continue;
    }

    const res = await apiPost("/api/auth/signup", neighbour, uid);
    if (!res.ok && res.status !== 409) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to create neighbour ${uid}: ${res.status} ${body}`
      );
    }
    console.log(`  + ${uid} account created (${neighbour.firstName} ${neighbour.lastName})`);
  }
}

async function seedElegantSpotlight() {
  const mysql2 = require("mysql2/promise");
  const elegantUid = BOT_UIDS.builders[5]; // sim-builder-006 = Elegant Building Services

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
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payments_oneoff (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        entity_id BIGINT UNSIGNED NULL,
        amount DECIMAL(10,2) NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
        status VARCHAR(50) NOT NULL DEFAULT 'pending_admin',
        provider_session_id VARCHAR(255) NULL,
        provider_payment_intent VARCHAR(255) NULL,
        expires_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Idempotent — delete any existing spotlight row for Elegant first
    await conn.query(
      `DELETE FROM payments_oneoff WHERE user_id = ? AND type = 'spotlight'`,
      [elegantUid]
    );

    // Insert active spotlight row that never expires
    await conn.query(
      `INSERT INTO payments_oneoff (user_id, type, entity_id, amount, currency, status, expires_at, created_at)
       VALUES (?, 'spotlight', NULL, 0, 'GBP', 'active', '2099-12-31 23:59:59', NOW())`,
      [elegantUid]
    );

    console.log(`  ✓ ${elegantUid} given active spotlight placement`);
  } finally {
    await conn.end();
  }
}

/**
 * Seed a single completed project fixture by index.
 * Updates state.completedProjectsSeedCount and writes state.
 */
async function seedOneCompletedProject(fixtureIndex, state) {
  const mysql2 = require("mysql2/promise");
  const fixture = completedProjectFixtures[fixtureIndex];
  if (!fixture) throw new Error(`No completed project fixture at index ${fixtureIndex}`);

  const ownerUid = BOT_UIDS.neighbours[fixture.ownerIdx];
  const recommenderUid = BOT_UIDS.neighbours[fixture.recommenderIdx];
  const ownerName = `${neighbours[fixture.ownerIdx].firstName} ${neighbours[fixture.ownerIdx].lastName}`;
  const recommenderName = `${neighbours[fixture.recommenderIdx].firstName} ${neighbours[fixture.recommenderIdx].lastName}`;
  const builderCompany = builders[fixture.builderIdx].companyName;

  console.log(`\n[seed] Seeding completed project ${fixtureIndex + 1}/${completedProjectFixtures.length}...`);

  // 1. Create project as the sim neighbour / homeowner
  const createRes = await apiPost("/api/projects", fixture.project, ownerUid);
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "");
    throw new Error(`Project creation failed for ${ownerUid}: ${createRes.status} ${body}`);
  }
  const createData = await createRes.json();
  const projectId = createData.project?.id;
  if (!projectId) throw new Error(`Project creation returned no id for ${ownerUid}`);
  console.log(`  + Project ${projectId} created (${fixture.project.type}) owned by ${ownerName}`);

  // 2. Set project live directly in DB — skips the publish API so no
  //    "new project in your area" notification is sent to real users.
  {
    const conn2 = await mysql2.createConnection(dbConfig());
    try {
      await conn2.query(
        `UPDATE projects SET status = 'live', updatedAt = NOW() WHERE id = ?`,
        [projectId]
      );
    } finally {
      await conn2.end();
    }
  }
  console.log(`  ✓ Project ${projectId} set live (silent)`);

  // 3. Add recommendation from another neighbour
  const recRes = await apiPost(
    `/api/projects/${projectId}/recommendations`,
    {
      name: recommenderName,
      email: `${recommenderUid}@sim.local`,
      company: builderCompany,
      comment: randomComment(),
      rating: 5,
      source: "platform",
    },
    recommenderUid
  );
  if (!recRes.ok) {
    const body = await recRes.text().catch(() => "");
    throw new Error(`Recommendation failed for project ${projectId}: ${recRes.status} ${body}`);
  }
  const recData = await recRes.json();
  const recId = recData.recommendationId;
  console.log(`  + Recommendation ${recId} added by ${recommenderName} (${builderCompany})`);

  // 4. Close the project with the winner
  const builderUid = BOT_UIDS.builders[fixture.builderIdx];
  const closeRes = await apiPost(
    `/api/projects/${projectId}/close`,
    {
      didGoAhead: true,
      winnerRecommendationId: recId,
      winnerTradesmanUid: builderUid,
      wouldUseAgain: true,
    },
    ownerUid
  );
  if (!closeRes.ok) {
    const body = await closeRes.text().catch(() => "");
    throw new Error(`Close failed for project ${projectId}: ${closeRes.status} ${body}`);
  }
  console.log(`  ✓ Project ${projectId} closed as completed (winner: ${builderCompany})`);

  // 5. Upload closure photos (best-effort — skipped if no photos available)
  try {
    await uploadClosurePhotos(projectId, ownerUid, fixture.photoCount || 3);
    console.log(`  ✓ Closure photos uploaded for project ${projectId}`);
  } catch (e) {
    console.warn(`  ! Closure photo upload skipped for project ${projectId}: ${e.message}`);
  }

  // Advance the seed count in state
  state.completedProjectsSeedCount = fixtureIndex + 1;
  writeState(state);
}

async function seed() {
  assertGuards();
  console.log("\n[seed] Starting bot pool seeding...");

  const adminUid = getAdminUid();

  await seedBuilders(adminUid);
  await seedNeighbours();
  await seedElegantSpotlight();

  const state = readState();
  state.seeded = true;
  state.seededAt = new Date().toISOString();
  if (!state.projects) state.projects = {};
  writeState(state);

  console.log("\n[seed] Done. Run `node scripts/simulate.js run --project-id=<id>` to start simulation.\n");
}

module.exports = { seed, seedOneCompletedProject, completedProjectFixtureCount: completedProjectFixtures.length };
