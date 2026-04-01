"use strict";

const fs = require("fs");
const path = require("path");
const { BOT_UIDS, getAdminUid, getApiBase } = require("./config");
const { mintToken, apiGet, apiPost, apiPut } = require("./api-client");
const { readState, writeState } = require("./state");
const builders = require("./fixtures/builders.json");
const neighbours = require("./fixtures/neighbours.json");

const BUILDER_PHOTOS_DIR = path.resolve(__dirname, "fixtures/builder-photos");

/**
 * Upload local photo files for a builder via POST /api/tradesmen/upload-photos.
 * Returns an array of server URLs (e.g. ["/uploads/tradesmen/sim-builder-006_xxx.jpeg"]).
 */
async function uploadBuilderPhotos(uid, filenames) {
  const form = new FormData();
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
  }

  const token = await mintToken(uid);
  const res = await fetch(`${getApiBase()}/api/tradesmen/upload-photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
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
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error("FIREBASE_AUTH_EMULATOR_HOST must be set");
  if (process.env.NODE_ENV === "production")
    throw new Error("Cannot run simulation in production");
  if (!getAdminUid())
    throw new Error("TEST_ADMIN_USER_UID must be set");
}

async function seedBuilders(adminUid) {
  console.log("\n[seed] Seeding builders...");

  for (let i = 0; i < BOT_UIDS.builders.length; i++) {
    const uid = BOT_UIDS.builders[i];
    const profile = builders[i];

    // Idempotency check — skip only if this UID already has an active tradesman profile
    const check = await apiGet("/api/tradesmen/me", uid);
    if (check.ok) {
      const checkData = await check.json().catch(() => ({}));
      if (checkData.role === "tradesman" && checkData.profile) {
        console.log(`  ✓ ${uid} already exists — skipping`);
        continue;
      }
    }

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

    // Step 3: Activate and assign to the bot UID. This promotes the lead_*
    // row to the real UID and inserts a 'tradesman' role into user_roles —
    // which is what the interest endpoint's middleware requires.
    const activateRes = await apiPost(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "active", assignTo: uid },
      adminUid
    );
    if (!activateRes.ok) {
      const body = await activateRes.text().catch(() => "");
      throw new Error(
        `activate failed for ${uid}: ${activateRes.status} ${body}`
      );
    }
    console.log(`  ✓ ${uid} activated and assigned`);

    // Step 4: Resolve photos — upload local files if specified, else use URLs
    let photoUrls = profile.photoUrls || [];
    let profilePictureUrl = profile.profilePictureUrl || null;

    if (profile.photoFiles && profile.photoFiles.length > 0) {
      console.log(`  ↑ ${uid} uploading ${profile.photoFiles.length} local photos...`);
      photoUrls = await uploadBuilderPhotos(uid, profile.photoFiles);
      console.log(`  ✓ ${uid} photos uploaded (${photoUrls.length} URLs)`);

      // Profile picture is the uploaded URL corresponding to profilePictureFile
      if (profile.profilePictureFile) {
        const picIdx = profile.photoFiles.indexOf(profile.profilePictureFile);
        profilePictureUrl = picIdx >= 0 && photoUrls[picIdx] ? photoUrls[picIdx] : photoUrls[0] || null;
      } else {
        profilePictureUrl = photoUrls[0] || null;
      }
    }

    // Step 5: Update full profile (photos, profile picture, discount, warranty, docs)
    const profileRes = await apiPut(
      "/api/tradesmen/me",
      {
        companyName: profile.companyName,
        contactName: profile.contactName,
        email: profile.email,
        phone: profile.phone,
        tradeTypes: profile.tradeTypes,
        serviceAreas: profile.serviceAreas,
        photoUrls,
        profilePictureUrl,
        discountMin: profile.discountMin || 0,
        discountMax: profile.discountMax || 0,
        warrantyMonths: profile.warrantyMonths || 0,
        supportingDocCount: profile.supportingDocCount || 0,
      },
      uid
    );
    if (!profileRes.ok) {
      const body = await profileRes.text().catch(() => "");
      throw new Error(
        `profile update failed for ${uid}: ${profileRes.status} ${body}`
      );
    }
    console.log(`  ✓ ${uid} profile updated (${photoUrls.length} photos)`);
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

module.exports = { seed };
