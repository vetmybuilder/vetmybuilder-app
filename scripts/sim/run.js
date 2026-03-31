"use strict";

const fs = require("fs");
const path = require("path");
const { BOT_UIDS, TIMING, FAST_TIMING, getApiBase } = require("./config");
const { mintToken, apiPost } = require("./api-client");
const { readState, writeState } = require("./state");
const builders = require("./fixtures/builders.json");
const neighbours = require("./fixtures/neighbours.json");
const comments = require("./fixtures/comments.json");

const PHOTOS_DIR = path.resolve(__dirname, "fixtures/photos");

/** Returns up to `max` photo file paths from the fixtures/photos directory, or []. */
function getFixturePhotos(offset = 0, max = 8) {
  if (!fs.existsSync(PHOTOS_DIR)) return [];
  const all = fs
    .readdirSync(PHOTOS_DIR)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => path.join(PHOTOS_DIR, f));
  return all.slice(offset, offset + max);
}

function assertGuards() {
  if (process.env.ENABLE_TEST_ROUTES !== "1")
    throw new Error("ENABLE_TEST_ROUTES=1 must be set");
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error("FIREBASE_AUTH_EMULATOR_HOST must be set");
  if (process.env.NODE_ENV === "production")
    throw new Error("Cannot run simulation in production");
}

function randomComment() {
  return comments[Math.floor(Math.random() * comments.length)];
}

function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  process.stdout.write(`  (waiting ${Math.round(ms / 1000)}s...)\n`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  console.log(`  [${new Date().toLocaleTimeString()}] ${msg}`);
}

function getProjectState(state, projectId) {
  if (!state.projects[projectId]) {
    state.projects[projectId] = {
      wavesCompleted: [],
      recommendationIds: {},
      startedAt: new Date().toISOString(),
    };
  }
  return state.projects[projectId];
}

async function recommend(projectId, neighbourIdx, builderIdx, neighbourName) {
  const uid = BOT_UIDS.neighbours[neighbourIdx];
  const company = builders[builderIdx].companyName;
  const phone = neighbours[neighbourIdx].phone || null;
  const photoPaths = getFixturePhotos(neighbourIdx * 8, 8);

  let res;

  if (photoPaths.length > 0) {
    // Multipart upload so we can attach photos
    const form = new FormData();
    form.append("name", neighbourName);
    form.append("email", `${uid}@sim.local`);
    if (phone) form.append("phone", phone);
    form.append("company", company);
    form.append("comment", randomComment());
    form.append("rating", "5");
    form.append("source", "platform");

    for (const filePath of photoPaths) {
      const blob = new Blob([fs.readFileSync(filePath)], { type: "image/jpeg" });
      form.append("photos", blob, path.basename(filePath));
    }

    const token = await mintToken(uid);
    res = await fetch(`${getApiBase()}/api/projects/${projectId}/recommendations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } else {
    res = await apiPost(
      `/api/projects/${projectId}/recommendations`,
      {
        name: neighbourName,
        email: `${uid}@sim.local`,
        phone,
        company,
        comment: randomComment(),
        rating: 5,
        source: "platform",
      },
      uid
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Recommendation failed (${uid} → ${company}): ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.recommendationId;
}

async function expressInterest(projectId, builderIdx) {
  const uid = BOT_UIDS.builders[builderIdx];

  const res = await apiPost(
    "/api/tradesmen/interest",
    { projectId: Number(projectId) },
    uid
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Interest failed (${uid}): ${res.status} ${body}`);
  }

  const data = await res.json();
  if (data.alreadyShared) {
    log(`${uid} already expressed interest — skipped`);
  } else {
    log(`${uid} expressed interest (rec id: ${data.recommendationId})`);
  }
  return data.recommendationId;
}

async function like(recId, neighbourIdx) {
  if (!recId) return;
  const uid = BOT_UIDS.neighbours[neighbourIdx];

  const res = await apiPost(`/api/recommendations/${recId}/like`, {}, uid);
  // A 4xx here likely means already liked — treat as non-fatal
  if (!res.ok && res.status < 500) {
    log(`${uid} like on rec ${recId} returned ${res.status} — skipping`);
    return;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Like failed (${uid} → rec ${recId}): ${res.status} ${body}`);
  }
  log(`${uid} liked recommendation ${recId}`);
}

function neighbourName(idx) {
  return `${neighbours[idx].firstName} ${neighbours[idx].lastName}`;
}

async function runWave1(projectId, state, fast) {
  const timing = fast ? FAST_TIMING : TIMING;
  const ps = getProjectState(state, projectId);

  console.log(`\n[run] Wave 1 — all 3 neighbours recommend Elegant + first batch of others`);
  await delay(timing.wave1);

  // All 3 neighbours recommend Elegant Building Services (idx 5) — guaranteed top
  const eRec1 = await recommend(projectId, 0, 5, neighbourName(0));
  log(`${neighbourName(0)} recommended ${builders[5].companyName} (rec id: ${eRec1})`);
  ps.recommendationIds["neighbour-001-elegant"] = eRec1;

  const eRec2 = await recommend(projectId, 1, 5, neighbourName(1));
  log(`${neighbourName(1)} recommended ${builders[5].companyName} (rec id: ${eRec2})`);
  ps.recommendationIds["neighbour-002-elegant"] = eRec2;

  const eRec3 = await recommend(projectId, 2, 5, neighbourName(2));
  log(`${neighbourName(2)} recommended ${builders[5].companyName} (rec id: ${eRec3})`);
  ps.recommendationIds["neighbour-003-elegant"] = eRec3;

  // Sarah also recommends builder-001, James recommends builder-002
  const rec4 = await recommend(projectId, 0, 0, neighbourName(0));
  log(`${neighbourName(0)} recommended ${builders[0].companyName} (rec id: ${rec4})`);
  ps.recommendationIds["neighbour-001-builder-001"] = rec4;

  const rec5 = await recommend(projectId, 1, 1, neighbourName(1));
  log(`${neighbourName(1)} recommended ${builders[1].companyName} (rec id: ${rec5})`);
  ps.recommendationIds["neighbour-002-builder-002"] = rec5;

  // Elegant and builder-001 express interest
  const eInt = await expressInterest(projectId, 5);
  ps.recommendationIds["interest-elegant"] = eInt;

  const int1 = await expressInterest(projectId, 0);
  ps.recommendationIds["interest-builder-001"] = int1;

  ps.wavesCompleted.push(1);
  writeState(state);
  log("Wave 1 complete");
}

async function runWave2(projectId, state, fast) {
  const timing = fast ? FAST_TIMING : TIMING;
  const ps = getProjectState(state, projectId);

  console.log(`\n[run] Wave 2 — more neighbour recommendations + more builder interest + likes on Elegant`);
  await delay(timing.wave2);

  // Sarah recommends builder-002 and builder-004 (Sarah: 4 recs total)
  const rec6 = await recommend(projectId, 0, 1, neighbourName(0));
  log(`${neighbourName(0)} recommended ${builders[1].companyName} (rec id: ${rec6})`);
  ps.recommendationIds["neighbour-001-builder-002"] = rec6;

  const rec7 = await recommend(projectId, 0, 3, neighbourName(0));
  log(`${neighbourName(0)} recommended ${builders[3].companyName} (rec id: ${rec7})`);
  ps.recommendationIds["neighbour-001-builder-004"] = rec7;

  // James recommends builder-003 and builder-005 (James: 4 recs total)
  const rec8 = await recommend(projectId, 1, 2, neighbourName(1));
  log(`${neighbourName(1)} recommended ${builders[2].companyName} (rec id: ${rec8})`);
  ps.recommendationIds["neighbour-002-builder-003"] = rec8;

  const rec9 = await recommend(projectId, 1, 4, neighbourName(1));
  log(`${neighbourName(1)} recommended ${builders[4].companyName} (rec id: ${rec9})`);
  ps.recommendationIds["neighbour-002-builder-005"] = rec9;

  // builder-002 and builder-003 express interest
  const int2 = await expressInterest(projectId, 1);
  ps.recommendationIds["interest-builder-002"] = int2;

  const int3 = await expressInterest(projectId, 2);
  ps.recommendationIds["interest-builder-003"] = int3;

  // All 3 neighbours like Elegant's rec from each other → Elegant gets the most likes
  await like(ps.recommendationIds["neighbour-001-elegant"], 1);
  await like(ps.recommendationIds["neighbour-002-elegant"], 0);
  await like(ps.recommendationIds["neighbour-003-elegant"], 0);

  ps.wavesCompleted.push(2);
  writeState(state);
  log("Wave 2 complete");
}

async function runWave3(projectId, state, fast) {
  const timing = fast ? FAST_TIMING : TIMING;
  const ps = getProjectState(state, projectId);

  console.log(`\n[run] Wave 3 — Rachel's remaining recs + final builder interest + likes`);
  await delay(timing.wave3);

  // Rachel recommends builder-001 and builder-003 (Rachel: 3 recs total)
  const rec10 = await recommend(projectId, 2, 0, neighbourName(2));
  log(`${neighbourName(2)} recommended ${builders[0].companyName} (rec id: ${rec10})`);
  ps.recommendationIds["neighbour-003-builder-001"] = rec10;

  const rec11 = await recommend(projectId, 2, 2, neighbourName(2));
  log(`${neighbourName(2)} recommended ${builders[2].companyName} (rec id: ${rec11})`);
  ps.recommendationIds["neighbour-003-builder-003"] = rec11;

  // builder-004 and builder-005 express interest (arrive late, rank lower)
  const int4 = await expressInterest(projectId, 3);
  ps.recommendationIds["interest-builder-004"] = int4;

  const int5 = await expressInterest(projectId, 4);
  ps.recommendationIds["interest-builder-005"] = int5;

  // Final like on Elegant from Rachel
  await like(ps.recommendationIds["neighbour-001-elegant"], 2);

  ps.wavesCompleted.push(3);
  ps.completedAt = new Date().toISOString();
  writeState(state);
  log("Wave 3 complete");
}

async function run(projectId, fast) {
  if (!projectId) throw new Error("--project-id is required");
  assertGuards();

  const state = readState();

  if (!state.seeded) {
    throw new Error(
      "Bot pool not seeded. Run `node scripts/simulate.js seed` first."
    );
  }

  const ps = getProjectState(state, projectId);
  const completed = ps.wavesCompleted;

  if (completed.includes(1) && completed.includes(2) && completed.includes(3)) {
    console.log(
      `\n[run] All waves already completed for project ${projectId}. Nothing to do.`
    );
    console.log("[run] Run `node scripts/simulate.js reset` and re-seed to start fresh.\n");
    return;
  }

  console.log(
    `\n[run] Starting simulation for project ${projectId}${fast ? " (--fast)" : ""}...`
  );

  if (!completed.includes(1)) await runWave1(projectId, state, fast);
  if (!completed.includes(2)) await runWave2(projectId, state, fast);
  if (!completed.includes(3)) await runWave3(projectId, state, fast);

  console.log(`\n[run] Simulation complete for project ${projectId}.`);
  console.log("[run] Your shortlist has 6 builders — Elegant Building Services leads with 3 endorsements.\n");
}

module.exports = { run };
