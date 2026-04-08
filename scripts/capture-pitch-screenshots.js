// scripts/capture-pitch-screenshots.js
//
// Drives the local dev:manual server through the homeowner / tradesman /
// neighbour journeys and saves a numbered PNG for each key screen so they
// can be dropped straight into a pitch deck.
//
// Pre-reqs:
//   - `npm run dev:manual` is running (web on :3000, API shard 0 on :3100)
//   - Chris (homeowner), Elegant (tradesman) and the sim builders are seeded
//     (handled automatically by dev:manual sim startup)
//
// The script is self-sufficient — if Chris has no live project, it creates
// one and seeds a few recommendations on it via the API so the project view
// has something interesting to screenshot.
//
// Usage:
//   node scripts/capture-pitch-screenshots.js
//
// Output: pitch-deck/screenshots/NN-name.png

const path = require("path");
const fs = require("fs");

function loadChromium() {
  // Playwright lives in e2e-tests/node_modules in this repo, not at the
  // root, so try the e2e-tests path as a fallback.
  try {
    return require("playwright").chromium;
  } catch {}
  try {
    return require(
      path.resolve(__dirname, "../e2e-tests/node_modules/playwright"),
    ).chromium;
  } catch (e) {
    console.error(
      "[capture] playwright not installed at root or in e2e-tests. " +
        "Try: cd e2e-tests && npm install",
    );
    process.exit(1);
  }
}

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUT_DIR = path.resolve(__dirname, "../pitch-deck/screenshots");

const HOMEOWNER = {
  email: "morris27sky@icloud.com",
  password: "password",
  uid: "chris-morris-homeowner-dev",
};

// E2E test secret from the root .env. Used together with X-Sim-Uid to
// bypass Firebase token verification on API calls made from the script
// itself (page.request doesn't share the browser's Firebase auth state).
const E2E_TEST_SECRET = readEnvVar("E2E_TEST_SECRET");

function readEnvVar(name) {
  try {
    const envFile = fs.readFileSync(
      path.resolve(__dirname, "../.env"),
      "utf8",
    );
    const line = envFile.split("\n").find((l) => l.startsWith(`${name}=`));
    if (!line) return null;
    return line.slice(name.length + 1).trim();
  } catch {
    return null;
  }
}

function simHeaders(uid) {
  if (!E2E_TEST_SECRET) {
    throw new Error(
      "E2E_TEST_SECRET not found in .env — needed for the sim-uid bypass " +
        "used to seed test data from this script.",
    );
  }
  return {
    "X-Sim-Uid": uid,
    "X-Test-Secret": E2E_TEST_SECRET,
    "Content-Type": "application/json",
  };
}

const TRADESMAN = {
  email: "info@elegantbuilding.co.uk",
  password: "o8hSUU8vagHTyuaOY0ov1w==",
};

const ADMIN = {
  email: "admin@example.com",
  password: "password",
};

const VIEWPORT = { width: 1440, height: 900 };

const captured = [];

async function shoot(page, name, opts = {}) {
  const filename = `${String(captured.length + 1).padStart(2, "0")}-${name}.png`;
  const filePath = path.join(OUT_DIR, filename);
  await page.screenshot({
    path: filePath,
    fullPage: opts.fullPage ?? false,
    animations: "disabled",
  });
  captured.push(filename);
  console.log(`  ✓ ${filename}`);
}

async function logout(page) {
  await page.goto(`${BASE_URL}/logout`, { waitUntil: "domcontentloaded" });
  await page
    .waitForURL(/signedOut=1|\/$/, { timeout: 10_000 })
    .catch(() => {});
}

async function login(page, { email, password }, opts = {}) {
  const next = opts.next || "/projects";
  await page.goto(`${BASE_URL}/login?next=${encodeURIComponent(next)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("input-login-email").fill(email);
  await page.getByTestId("input-login-password").fill(password);
  await page.getByTestId("btn-login").click();
  await page.waitForURL(new RegExp(next.replace(/\//g, "\\/")), {
    timeout: 30_000,
  });
}

// Wait for the page to feel "settled" — Next.js + Tailwind have lots of
// post-mount layout shifts so a fixed sleep is more reliable than waiting
// for any specific selector.
async function settle(page, ms = 1500) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

// ─── Test data setup ────────────────────────────────────────────────

/**
 * Make sure Chris has at least one live project with a few recommendations
 * on it so the project view, builder profile and hire-related screens have
 * something to display. Returns { projectId, recommendationIds }.
 */
async function ensureChrisProjectWithRecommendations(page) {
  const headers = simHeaders(HOMEOWNER.uid);

  // 1. Find or create the project
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
    console.log("  + Creating a new project for Chris…");
    const createRes = await page.request.post(`${BASE_URL}/api/projects`, {
      headers,
      data: {
        name: "Demolition (Internal/External) in E4 (Semi-Detached)",
        type: "Demolition (Internal/External)",
        location: "E4",
        description:
          "We're knocking down the rear extension and reopening the kitchen-diner. Looking for a builder who has done similar work locally and can advise on structural sign-off.",
        propertyType: "Semi-Detached",
        bedrooms: 2,
      },
    });
    if (!createRes.ok()) {
      throw new Error(
        `POST /api/projects failed: ${createRes.status()} ${await createRes.text()}`,
      );
    }
    project = (await createRes.json()).project;

    const publishRes = await page.request.post(
      `${BASE_URL}/api/projects/${project.id}/publish`,
      { headers },
    );
    if (!publishRes.ok()) {
      throw new Error(
        `POST /api/projects/${project.id}/publish failed: ${publishRes.status()}`,
      );
    }
  } else {
    console.log(`  ~ Reusing Chris's existing project ${project.id}`);
  }

  // 2. Make sure there are at least a few recommendations on it
  const recsRes = await page.request.get(
    `${BASE_URL}/api/projects/${project.id}/recommendations`,
    { headers },
  );
  const recsBody = recsRes.ok() ? await recsRes.json() : {};
  let recommendations = Array.isArray(recsBody?.recommendations)
    ? recsBody.recommendations
    : Array.isArray(recsBody?.items)
      ? recsBody.items
      : [];

  if (recommendations.length < 3) {
    console.log("  + Seeding recommendations on the project…");
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
      const res = await page.request.post(
        `${BASE_URL}/api/projects/${project.id}/recommendations`,
        { headers, data: rec },
      );
      if (!res.ok()) {
        console.warn(
          `  ! seeding "${rec.company}" failed: ${res.status()} ${await res.text()}`,
        );
      }
    }

    const refetched = await page.request.get(
      `${BASE_URL}/api/projects/${project.id}/recommendations`,
      { headers },
    );
    if (refetched.ok()) {
      const body = await refetched.json();
      recommendations = Array.isArray(body?.recommendations)
        ? body.recommendations
        : Array.isArray(body?.items)
          ? body.items
          : [];
    }
  }

  return {
    projectId: project.id,
    recommendationIds: recommendations.map((r) => r.id).filter(Boolean),
  };
}

// ─── PUBLIC PAGES (no login) ────────────────────────────────────────

async function capturePublicPages(context) {
  console.log("\n[public] Public-facing pages…");
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await shoot(page, "homeowner-landing", { fullPage: true });

  await page.goto(`${BASE_URL}/how-it-works`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await shoot(page, "homeowner-how-it-works", { fullPage: true });

  await page.goto(`${BASE_URL}/how-it-works-trades`, {
    waitUntil: "domcontentloaded",
  });
  await settle(page);
  await shoot(page, "tradesman-how-it-works", { fullPage: true });

  await page.goto(`${BASE_URL}/signup`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await shoot(page, "homeowner-signup-form");

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await shoot(page, "homeowner-login");

  await page.close();
}

// ─── TRADE SIGNUP STEP 1 (no login) ─────────────────────────────────
//
// We only capture step 1. Walking deeper into the wizard requires mocking
// Companies House lookups and is more brittle than it's worth for a deck.

async function captureTradeSignupStep1(context) {
  console.log("\n[trades] Trade signup wizard (step 1 only)…");
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/tradesman/register-tradesmen`, {
    waitUntil: "domcontentloaded",
  });
  await settle(page);
  await shoot(page, "trade-signup-step1-company", { fullPage: true });

  await page.close();
}

// ─── HOMEOWNER JOURNEY (logged in as Chris) ─────────────────────────

async function captureHomeownerJourney(context) {
  console.log("\n[homeowner] Logged-in homeowner pages…");
  const page = await context.newPage();

  await login(page, HOMEOWNER, { next: "/projects" });
  await settle(page, 2000);
  await shoot(page, "homeowner-projects-list", { fullPage: true });

  // Make sure the test data exists, then navigate directly using the id.
  let projectId = null;
  let recommendationIds = [];
  try {
    const setup = await ensureChrisProjectWithRecommendations(page);
    projectId = setup.projectId;
    recommendationIds = setup.recommendationIds;
  } catch (e) {
    console.warn(`  ! data setup failed: ${e?.message || e}`);
  }

  if (projectId) {
    await page.goto(`${BASE_URL}/projects/${projectId}`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page, 2500);
    await shoot(page, "homeowner-project-view-with-recommendations", {
      fullPage: true,
    });
    await shoot(page, "homeowner-project-view-hero");
  }

  // Builder profile — pick the first recommendation we have
  if (recommendationIds.length) {
    const recId = recommendationIds[0];
    const url = projectId
      ? `${BASE_URL}/builders/${recId}?projectId=${projectId}`
      : `${BASE_URL}/builders/${recId}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await settle(page, 2000);
    await shoot(page, "builder-profile", { fullPage: true });
  } else {
    console.warn("  ! No recommendation ids — skipping builder profile shot");
  }

  await page.close();
}

// ─── TRADESMAN JOURNEY (logged in as Elegant) ───────────────────────

async function captureTradesmanJourney(context) {
  console.log("\n[tradesman] Logged-in tradesman pages…");
  const page = await context.newPage();

  await login(page, TRADESMAN, { next: "/tradesman/projects" });
  await settle(page, 2500);
  await shoot(page, "tradesman-jobs-list", { fullPage: true });

  // Try to expand the first project row in the accordion. If there are no
  // visible jobs (no projects in Elegant's service areas / trades) we still
  // get the empty-state list shot above.
  const accordionContainer = page.getByTestId("tradesman-projects-accordion");
  if (await accordionContainer.count()) {
    const firstRow = accordionContainer.getByTestId("project-row").first();
    if (await firstRow.count()) {
      await firstRow.click();
      await settle(page, 2500);
      await shoot(page, "tradesman-project-expanded", { fullPage: true });
    } else {
      console.warn(
        "  ! No project rows visible — Elegant may not match any seeded jobs",
      );
    }
  }

  // Tradesman own profile page
  await page.goto(`${BASE_URL}/tradesman/profile`, {
    waitUntil: "domcontentloaded",
  });
  await settle(page, 2000);
  await shoot(page, "tradesman-own-profile", { fullPage: true });

  await page.close();
}

// ─── ADMIN LEADERBOARD (bonus) ──────────────────────────────────────

async function captureAdminLeaderboard(context) {
  console.log("\n[admin] Admin tradesmen leaderboard…");
  const page = await context.newPage();

  try {
    await login(page, ADMIN, { next: "/admin/tradesmen-leaderboard" });
    await settle(page, 2500);
    await shoot(page, "admin-tradesmen-leaderboard", { fullPage: true });
  } catch (e) {
    console.warn(`  ! Skipped admin shot: ${e?.message || e}`);
  }

  await page.close();
}

// ─── MAIN ───────────────────────────────────────────────────────────

(async () => {
  const chromium = loadChromium();

  // Wipe any previous run so the file numbering stays in sync with the
  // current capture sequence.
  if (fs.existsSync(OUT_DIR)) {
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (f.endsWith(".png")) fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[capture] Output: ${OUT_DIR}`);
  console.log(`[capture] Base URL: ${BASE_URL}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // retina-quality screenshots
  });

  const blocks = [
    capturePublicPages,
    captureTradeSignupStep1,
    captureHomeownerJourney,
    captureTradesmanJourney,
    captureAdminLeaderboard,
  ];

  for (const block of blocks) {
    try {
      await context.clearCookies();
      const cleanupPage = await context.newPage();
      await logout(cleanupPage).catch(() => {});
      await cleanupPage.close();
      await block(context);
    } catch (e) {
      console.error(`[capture] Block ${block.name} failed: ${e?.message || e}`);
    }
  }

  await browser.close();

  console.log(
    `\n[capture] Done. ${captured.length} screenshot(s) saved to:\n  ${OUT_DIR}`,
  );
})().catch((e) => {
  console.error("[capture] Fatal:", e);
  process.exit(1);
});
