// scripts/record-pitch-demo.js
//
// Records a ~30-second screen capture of the homeowner journey on the
// local dev:manual server, intended to be embedded on slide 1 of the pitch
// deck. Output is converted to MP4 (via ffmpeg if available) so PowerPoint
// can play it natively.
//
// The recorded journey:
//   1. Land on /login pre-filled
//   2. Sign in as Chris
//   3. Land on /projects, pause to read
//   4. Click into the live project
//   5. Pause on the populated project view (the "money shot")
//   6. Scroll to show the spotlight + Top Recommendations card
//   7. Hover over a recommendation, click Hire
//   8. Show the hire confirmation modal briefly
//   9. End
//
// Pre-reqs (same as the screenshot script):
//   - npm run dev:manual is running
//   - Chris has at least one live project (the script will create one if not)
//
// Usage:
//   node scripts/record-pitch-demo.js

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

function loadChromium() {
  try {
    return require("playwright").chromium;
  } catch {}
  try {
    return require(
      path.resolve(__dirname, "../e2e-tests/node_modules/playwright"),
    ).chromium;
  } catch {
    console.error("[record] playwright not installed");
    process.exit(1);
  }
}

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUT_DIR = path.resolve(__dirname, "../pitch-deck");
const TMP_DIR = path.resolve(OUT_DIR, ".tmp-recording");
const FINAL_WEBM = path.join(OUT_DIR, "demo.webm");
const FINAL_MP4 = path.join(OUT_DIR, "demo.mp4");

const HOMEOWNER = {
  email: "morris27sky@icloud.com",
  password: "password",
  uid: "chris-morris-homeowner-dev",
};

const VIEWPORT = { width: 1280, height: 800 };

function readEnvVar(name) {
  try {
    const envFile = fs.readFileSync(
      path.resolve(__dirname, "../.env"),
      "utf8",
    );
    const line = envFile.split("\n").find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : null;
  } catch {
    return null;
  }
}

const E2E_TEST_SECRET = readEnvVar("E2E_TEST_SECRET");

function simHeaders(uid) {
  if (!E2E_TEST_SECRET) {
    throw new Error("E2E_TEST_SECRET not found in .env");
  }
  return {
    "X-Sim-Uid": uid,
    "X-Test-Secret": E2E_TEST_SECRET,
    "Content-Type": "application/json",
  };
}

// ─── Test data setup (mirrors capture-pitch-screenshots.js) ─────────

async function ensureChrisProjectWithRecommendations(page) {
  const headers = simHeaders(HOMEOWNER.uid);

  const listRes = await page.request.get(
    `${BASE_URL}/api/projects?tab=mine&pageSize=50`,
    { headers },
  );
  if (!listRes.ok()) {
    throw new Error(`GET /api/projects failed: ${listRes.status()}`);
  }
  const listBody = await listRes.json();
  const items = Array.isArray(listBody?.items) ? listBody.items : [];
  let project = items.find(
    (p) => String(p.status || "").toLowerCase() === "live",
  );

  if (!project) {
    console.log("  + creating Chris's project");
    const createRes = await page.request.post(`${BASE_URL}/api/projects`, {
      headers,
      data: {
        name: "Demolition (Internal/External) in E4 (Semi-Detached)",
        type: "Demolition (Internal/External)",
        location: "E4",
        description:
          "We're knocking down the rear extension and reopening the kitchen-diner. Looking for a builder who has done similar work locally.",
        propertyType: "Semi-Detached",
        bedrooms: 2,
      },
    });
    if (!createRes.ok()) {
      throw new Error(`POST /api/projects failed: ${createRes.status()}`);
    }
    project = (await createRes.json()).project;

    const publishRes = await page.request.post(
      `${BASE_URL}/api/projects/${project.id}/publish`,
      { headers },
    );
    if (!publishRes.ok()) {
      throw new Error(`publish failed: ${publishRes.status()}`);
    }
  }

  // Make sure there are recommendations on it
  const recsRes = await page.request.get(
    `${BASE_URL}/api/projects/${project.id}/recommendations`,
    { headers },
  );
  const recsBody = recsRes.ok() ? await recsRes.json() : {};
  const existing = Array.isArray(recsBody?.recommendations)
    ? recsBody.recommendations
    : Array.isArray(recsBody?.items)
      ? recsBody.items
      : [];

  if (existing.length < 3) {
    console.log("  + seeding recommendations");
    const recsToSeed = [
      {
        name: "Sarah from next door",
        company: "Elegant Building Services",
        comment:
          "Used them for our extension last year. Quoted fairly, finished a week early, and tidied up beautifully — would 100% use again.",
      },
      {
        name: "Mike at #14",
        company: "AD House Construction",
        comment:
          "Really professional team. Spotted a few extra issues during the quote and fixed them without inflating the price.",
      },
      {
        name: "Priya from the close",
        company: "JB Roofing Solutions Ltd",
        comment:
          "Competitive quote, stuck to it, and delivered exactly what was promised.",
      },
    ];
    for (const rec of recsToSeed) {
      await page.request.post(
        `${BASE_URL}/api/projects/${project.id}/recommendations`,
        { headers, data: rec },
      );
    }
  }

  return { projectId: project.id };
}

// ─── Recording ──────────────────────────────────────────────────────

async function recordJourney(context, projectId) {
  const page = await context.newPage();

  // 1. Login screen — pre-fill and click. Filling is fast so the demo
  // viewer doesn't get bored watching characters appear.
  await page.goto(
    `${BASE_URL}/login?next=${encodeURIComponent("/projects")}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(1000);
  await page.getByTestId("input-login-email").fill(HOMEOWNER.email);
  await page.waitForTimeout(400);
  await page.getByTestId("input-login-password").fill(HOMEOWNER.password);
  await page.waitForTimeout(600);
  await page.getByTestId("btn-login").click();

  // 2. Land on /projects
  await page.waitForURL(/\/projects/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // 3. Click into the project directly via URL (more reliable than hunting
  // for the right card link, since /projects/new is also a link).
  await page.goto(`${BASE_URL}/projects/${projectId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 4. Scroll down slowly to reveal the spotlight + hired tradesmen
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);

  // 5. Scroll back up to the Top Recommendations card
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1000);

  // 6. Hover the first Hire button, then click it. The hire button is
  // inside the Top Recommendations card. We use a tolerant selector
  // because the testid may vary.
  const firstHireBtn = page
    .getByRole("button", { name: /^Hire$/i })
    .first();
  if (await firstHireBtn.count()) {
    await firstHireBtn.hover();
    await page.waitForTimeout(700);
    await firstHireBtn.click();
    await page.waitForTimeout(2500);
    // Close any modal that opened
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1000);
  } else {
    console.warn("  ! Hire button not found — skipping click");
    await page.waitForTimeout(2000);
  }

  // 7. Final pause on the populated project view
  await page.waitForTimeout(1500);

  await page.close();
}

// ─── Setup helpers ──────────────────────────────────────────────────

async function ensureSetup(setupBrowser) {
  // Use a separate, unrecorded context for data setup so the API noise
  // doesn't end up in the video.
  const setupCtx = await setupBrowser.newContext({ viewport: VIEWPORT });
  const setupPage = await setupCtx.newPage();
  // Login first so the request context is populated for cookies (sim
  // bypass headers don't need this, but the journey itself does).
  await setupPage.goto(
    `${BASE_URL}/login?next=${encodeURIComponent("/projects")}`,
    { waitUntil: "domcontentloaded" },
  );
  await setupPage.getByTestId("input-login-email").fill(HOMEOWNER.email);
  await setupPage.getByTestId("input-login-password").fill(HOMEOWNER.password);
  await setupPage.getByTestId("btn-login").click();
  await setupPage.waitForURL(/\/projects/, { timeout: 15_000 });

  const setup = await ensureChrisProjectWithRecommendations(setupPage);
  await setupCtx.close();
  return setup;
}

// ─── Main ───────────────────────────────────────────────────────────

(async () => {
  const chromium = loadChromium();

  // Clean tmp + previous outputs
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });
  for (const f of [FINAL_WEBM, FINAL_MP4]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log(`[record] base: ${BASE_URL}`);
  console.log(`[record] tmp: ${TMP_DIR}`);

  const browser = await chromium.launch();

  // Setup — make sure the data is in place
  console.log("[record] setup phase…");
  const { projectId } = await ensureSetup(browser);
  console.log(`[record] using project ${projectId}`);

  // Recording context — Playwright records the entire context lifetime
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1, // recording at 2x makes huge files; 1x is fine
    recordVideo: {
      dir: TMP_DIR,
      size: VIEWPORT,
    },
  });

  console.log("[record] recording journey…");
  await recordJourney(context, projectId);

  await context.close();
  await browser.close();

  // Find the recorded webm (Playwright names it randomly)
  const recordings = fs
    .readdirSync(TMP_DIR)
    .filter((f) => f.endsWith(".webm"));
  if (!recordings.length) {
    console.error("[record] no recording produced");
    process.exit(1);
  }
  const recordedPath = path.join(TMP_DIR, recordings[0]);
  fs.renameSync(recordedPath, FINAL_WEBM);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  const webmKb = Math.round(fs.statSync(FINAL_WEBM).size / 1024);
  console.log(`[record] saved demo.webm (${webmKb} KB)`);

  // Convert to MP4 with ffmpeg if available — PowerPoint plays MP4 natively
  // but not WebM, so this matters for the embedded slide-1 video.
  const ffmpegOk = spawnSync("which", ["ffmpeg"]).status === 0;
  if (ffmpegOk) {
    console.log("[record] converting to MP4…");
    const conv = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        FINAL_WEBM,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-an", // no audio (Playwright recordings have none anyway)
        FINAL_MP4,
      ],
      { stdio: "inherit" },
    );
    if (conv.status === 0 && fs.existsSync(FINAL_MP4)) {
      const mp4Kb = Math.round(fs.statSync(FINAL_MP4).size / 1024);
      console.log(`[record] saved demo.mp4 (${mp4Kb} KB)`);
    } else {
      console.warn("[record] ffmpeg conversion failed; webm only");
    }
  } else {
    console.warn(
      "[record] ffmpeg not found — keeping webm only. PowerPoint won't play webm natively; install ffmpeg or use the webm in Keynote/Google Slides.",
    );
  }

  console.log(`\n[record] done. Output: ${OUT_DIR}`);
})().catch((e) => {
  console.error("[record] fatal:", e);
  process.exit(1);
});
