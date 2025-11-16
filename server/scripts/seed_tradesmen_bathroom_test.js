#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed 5 tradesmen for Featured-project matching tests:
 *
 *  - 4 x Bathroom trades (should match project.type = "Bathroom")
 *  - 1 x External Wall Insulation only (should NOT match Bathroom projects)
 *
 * All are gold plan so they show up when using onlyGold=true.
 *
 * Usage:
 *   node server/scripts/seed_tradesmen_bathroom_test.js --db=data/app.db
 *   node server/scripts/seed_tradesmen_bathroom_test.js --db=data/app.db --reset=true
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// --------- config / args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const DB_PATH = args.db || process.env.DB_FILE || "server/db.sqlite";
const RESET_DB =
  args.reset === true ||
  args.reset === "true" ||
  args.reset === "1" ||
  args.reset === "";

const SUBS_TABLE = "payments_subscription";
const PHOTOS_TABLE = "tradesmen_photos";

// --------- date helper ----------
const nowSql = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-` +
    `${pad(d.getMonth() + 1)}-` +
    `${pad(d.getDate())} ` +
    `${pad(d.getHours())}:` +
    `${pad(d.getMinutes())}:` +
    `${pad(d.getSeconds())}`
  );
};

// --------- open / optional reset db ----------
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

if (RESET_DB && fs.existsSync(DB_PATH)) {
  console.log(`⚠️  --reset specified, deleting existing DB: ${DB_PATH}`);
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);

// --------- helpers ----------
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const tblCols = (name) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${name})`)
      .all()
      .map((r) => r.name)
  );

const addColIfMissing = (tbl, colDef, colName) => {
  const cols = tblCols(tbl);
  if (!cols.has(colName)) {
    db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${colDef}`).run();
  }
};

// scoring helpers – same pattern as your gold-plan script
const WARRANTY_SCALE = [
  { m: 0, p: 0 },
  { m: 6, p: 8 },
  { m: 12, p: 12 },
  { m: 24, p: 16 },
  { m: 36, p: 20 },
];

const lerpWarranty = (months) => {
  const m = Math.max(0, parseInt(months || 0, 10));
  if (m >= 36) return 20;
  for (let i = 0; i < WARRANTY_SCALE.length - 1; i++) {
    const a = WARRANTY_SCALE[i];
    const b = WARRANTY_SCALE[i + 1];
    if (m >= a.m && m <= b.m) {
      const t = (m - a.m) / Math.max(1, b.m - a.m);
      return Math.round(a.p + t * (b.p - a.p));
    }
  }
  return 0;
};

const toBadge = (score) =>
  score >= 85
    ? "platinum"
    : score >= 70
    ? "gold"
    : score >= 50
    ? "silver"
    : "bronze";

const WEIGHTS = {
  serviceAreasMin3: 10,
  webPresenceAny: 5,
  chVerified: 25,
  tradesMin3: 15,
  photosMin3: 15,
  discountAny: 5,
  warrantyMax: 20,
  docsMin2: 10,
};

function computeScore(row) {
  const areas = (row.service_areas || "")
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const trades = (row.trade_types || "")
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const photos = Math.max(0, parseInt(row.photo_count || 0, 10));
  const hasDiscount = parseInt(row.offers_discount || 0, 10) > 0;
  const wPts = lerpWarranty(row.warranty_months);
  const chOK = String(row.ch_status || "").toLowerCase() === "verified";
  const webOK = parseInt(row.web_verified || 0, 10) === 1;

  let score =
    (areas.length >= 3 ? WEIGHTS.serviceAreasMin3 : 0) +
    (webOK ? WEIGHTS.webPresenceAny : 0) +
    (chOK ? WEIGHTS.chVerified : 0) +
    (trades.length >= 3 ? WEIGHTS.tradesMin3 : 0) +
    (photos >= 3 ? WEIGHTS.photosMin3 : 0) +
    (hasDiscount ? WEIGHTS.discountAny : 0) +
    Math.min(wPts, WEIGHTS.warrantyMax) +
    (parseInt(row.supporting_doc_count || 0, 10) >= 2 ? WEIGHTS.docsMin2 : 0);

  score = Math.max(0, Math.min(100, score));
  return { score, badge: toBadge(score) };
}

// --------- ensure schema ----------
db.prepare(
  `CREATE TABLE IF NOT EXISTS user_roles (uid TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user')`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS tradesmen (
    user_id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    trade_types TEXT DEFAULT '',
    service_areas TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    subscription_status TEXT DEFAULT 'inactive',
    contact_credits INTEGER DEFAULT 0
  )
`
).run();

// columns used by leaderboard/scoring + plans
addColIfMissing("tradesmen", "vmb_score REAL DEFAULT 0", "vmb_score");
addColIfMissing("tradesmen", "vmb_badge TEXT DEFAULT 'bronze'", "vmb_badge");
addColIfMissing("tradesmen", "web_verified INTEGER DEFAULT 0", "web_verified");
addColIfMissing("tradesmen", "web_url TEXT", "web_url");
addColIfMissing(
  "tradesmen",
  "social_links_json TEXT DEFAULT '[]'",
  "social_links_json"
);
addColIfMissing("tradesmen", "company_number TEXT", "company_number");
addColIfMissing("tradesmen", "ch_status TEXT", "ch_status");
addColIfMissing("tradesmen", "ch_name TEXT", "ch_name");
addColIfMissing("tradesmen", "likes_count INTEGER DEFAULT 0", "likes_count");
addColIfMissing("tradesmen", "wins_count INTEGER DEFAULT 0", "wins_count");
addColIfMissing("tradesmen", "photo_count INTEGER DEFAULT 0", "photo_count");
addColIfMissing(
  "tradesmen",
  "offers_discount INTEGER DEFAULT 0",
  "offers_discount"
);
addColIfMissing(
  "tradesmen",
  "warranty_months INTEGER DEFAULT 0",
  "warranty_months"
);
addColIfMissing(
  "tradesmen",
  "supporting_doc_count INTEGER DEFAULT 0",
  "supporting_doc_count"
);
addColIfMissing("tradesmen", "status TEXT DEFAULT 'active'", "status");
addColIfMissing("tradesmen", "plan TEXT", "plan");
addColIfMissing("tradesmen", "purchased_plan TEXT", "purchased_plan");

// subscriptions table (same structure as your gold script)
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS ${SUBS_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_uid TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_session_id TEXT,
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    provider_payment_intent TEXT,
    created_at TEXT NOT NULL
  )
`
).run();

// photos table
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS ${PHOTOS_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tradesman_user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    sort_order INTEGER,
    created_at TEXT NOT NULL
  )
`
).run();

// avoid duplicate gold subs for same user
const hasGoldSubForUser = db.prepare(
  `
  SELECT 1 AS ok
  FROM ${SUBS_TABLE}
  WHERE buyer_uid = ? AND plan_id = 'gold'
  LIMIT 1
`
);

// photo URLs to attach (reuse the same 4)
const PHOTO_URLS = [
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7urz_p20wpp.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7urz_syd9mx.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7us0_4nzmfg.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7us0_snwu07.jpeg",
];

// --------- deterministic fixtures ----------
// 4 Bathroom, 1 External Wall Insulation only
const FIXTURES = [
  {
    key: "bathroom-1",
    company: "Bathroom trader 492",
    trade_types: "Bathroom",
    service_areas: "E4,E17,Walthamstow",
  },
  {
    key: "bathroom-2",
    company: "Bathroom trader Solutions 249",
    trade_types: "Bathroom,Plumber",
    service_areas: "E4,E10,N17",
  },
  {
    key: "bathroom-3",
    company: "Bathroom trader Ltd 912",
    trade_types: "Bathroom,Plasterer",
    service_areas: "Hackney,E5,E20,E17",
  },
  {
    key: "bathroom-4",
    company: "Bathroom trader Contracts 777",
    trade_types: "Bathroom,Loft Insulation",
    service_areas: "E4,E5,E10",
  },
  {
    key: "external-1",
    company: "External Wall Insulation Pro 555",
    trade_types: "External Wall Insulation",
    service_areas: "E4,E17",
  },
];

// --------- seed transaction ----------
const tx = db.transaction(() => {
  const upsertT = db.prepare(`
    INSERT INTO tradesmen (
      user_id,
      company_name,
      contact_name,
      phone,
      email,
      trade_types,
      service_areas,
      created_at,
      updated_at,
      subscription_status,
      contact_credits,
      status,
      company_number,
      ch_status,
      ch_name,
      vmb_score,
      likes_count,
      wins_count,
      web_url,
      social_links_json,
      vmb_badge,
      offers_discount,
      warranty_months,
      photo_count,
      web_verified,
      supporting_doc_count,
      plan,
      purchased_plan
    )
    VALUES (
      @user_id,
      @company_name,
      @contact_name,
      @phone,
      @email,
      @trade_types,
      @service_areas,
      @created_at,
      @updated_at,
      @subscription_status,
      @contact_credits,
      @status,
      @company_number,
      @ch_status,
      @ch_name,
      @vmb_score,
      @likes_count,
      @wins_count,
      @web_url,
      @social_links_json,
      @vmb_badge,
      @offers_discount,
      @warranty_months,
      @photo_count,
      @web_verified,
      @supporting_doc_count,
      @plan,
      @purchased_plan
    )
    ON CONFLICT(user_id) DO UPDATE SET
      company_name=excluded.company_name,
      contact_name=excluded.contact_name,
      phone=excluded.phone,
      email=excluded.email,
      trade_types=excluded.trade_types,
      service_areas=excluded.service_areas,
      created_at=excluded.created_at,
      updated_at=excluded.updated_at,
      subscription_status=excluded.subscription_status,
      contact_credits=excluded.contact_credits,
      status=excluded.status,
      company_number=excluded.company_number,
      ch_status=excluded.ch_status,
      ch_name=excluded.ch_name,
      vmb_score=excluded.vmb_score,
      likes_count=excluded.likes_count,
      wins_count=excluded.wins_count,
      web_url=excluded.web_url,
      social_links_json=excluded.social_links_json,
      vmb_badge=excluded.vmb_badge,
      offers_discount=excluded.offers_discount,
      warranty_months=excluded.warranty_months,
      photo_count=excluded.photo_count,
      web_verified=excluded.web_verified,
      supporting_doc_count=excluded.supporting_doc_count,
      plan=excluded.plan,
      purchased_plan=excluded.purchased_plan
  `);

  const upsertRole = db.prepare(`
    INSERT INTO user_roles (uid, role) VALUES (@uid, 'tradesman')
    ON CONFLICT(uid) DO UPDATE SET role='tradesman'
  `);

  const insertSub = db.prepare(`
    INSERT INTO ${SUBS_TABLE} (
      buyer_uid,
      plan_id,
      amount,
      currency,
      status,
      provider_session_id,
      provider_customer_id,
      provider_subscription_id,
      provider_payment_intent,
      created_at
    )
    VALUES (
      @buyer_uid,
      @plan_id,
      @amount,
      @currency,
      @status,
      @provider_session_id,
      @provider_customer_id,
      @provider_subscription_id,
      @provider_payment_intent,
      @created_at
    )
  `);

  const deletePhotosForUser = db.prepare(
    `DELETE FROM ${PHOTOS_TABLE} WHERE tradesman_user_id = ?`
  );

  const insertPhoto = db.prepare(
    `
    INSERT INTO ${PHOTOS_TABLE} (tradesman_user_id, url, sort_order, created_at)
    VALUES (@tradesman_user_id, @url, @sort_order, @created_at)
  `
  );

  FIXTURES.forEach((f, idx) => {
    const uid = `seed.bathroomtest.${slug(f.key)}`;
    const createdAt = nowSql();
    const updatedAt = createdAt;
    const domain = `${slug(f.company)}.example.com`;

    // core row with minimal but consistent scoring inputs
    const base = {
      service_areas: f.service_areas,
      trade_types: f.trade_types,
      web_verified: 1,
      ch_status: "verified",
      photo_count: PHOTO_URLS.length,
      offers_discount: 10,
      warranty_months: 24,
      supporting_doc_count: 2,
    };

    const { score, badge } = computeScore(base);

    const social_links_json = JSON.stringify([
      `https://instagram.com/${slug(f.company)}`,
      `https://facebook.com/${slug(f.company)}`,
    ]);

    upsertT.run({
      user_id: uid,
      company_name: f.company,
      contact_name: "test contact",
      phone: "020 8000 0000",
      email: `info@${domain}`,
      trade_types: f.trade_types,
      service_areas: f.service_areas,
      created_at: createdAt,
      updated_at: updatedAt,
      subscription_status: "active",
      contact_credits: 0,
      status: "active",
      company_number: String(60000000 + idx),
      ch_status: "verified",
      ch_name: f.company,
      vmb_score: score,
      likes_count: 0,
      wins_count: 0,
      web_url: `https://${domain}`,
      social_links_json,
      vmb_badge: badge,
      offers_discount: base.offers_discount,
      warranty_months: base.warranty_months,
      photo_count: base.photo_count,
      web_verified: base.web_verified,
      supporting_doc_count: base.supporting_doc_count,
      plan: "gold",
      purchased_plan: "gold",
    });

    upsertRole.run({ uid });

    // Photos: clear and insert fixed URLs
    deletePhotosForUser.run(uid);
    const photosCreatedAt = nowSql();
    PHOTO_URLS.forEach((url, pIdx) => {
      insertPhoto.run({
        tradesman_user_id: uid,
        url,
        sort_order: pIdx + 1,
        created_at: photosCreatedAt,
      });
    });

    // Gold subscription row – status 'succeeded'
    const existing = hasGoldSubForUser.get(uid);
    if (!existing) {
      const createdSubAt = nowSql();
      const sessId = `sess_${(600000000000 + idx).toString(16)}`;

      insertSub.run({
        buyer_uid: uid,
        plan_id: "gold",
        amount: 2900,
        currency: "GBP",
        status: "succeeded",
        provider_session_id: sessId,
        provider_customer_id: null,
        provider_subscription_id: null,
        provider_payment_intent: `mock:${sessId}`,
        created_at: createdSubAt,
      });
    }
  });
});

tx();

// --------- summary ----------
const seeded = db
  .prepare(
    `
    SELECT user_id, company_name, trade_types, vmb_score
    FROM tradesmen
    WHERE user_id LIKE 'seed.bathroomtest.%'
    ORDER BY company_name
  `
  )
  .all();

console.log(
  `✅ Seeded ${seeded.length} bathroom-test tradesmen into ${DB_PATH}`
);
seeded.forEach((r) => {
  console.log(
    ` - ${r.user_id}: ${r.company_name} [${r.trade_types}] score=${r.vmb_score}`
  );
});
console.log(`✅ Subscriptions table used: ${SUBS_TABLE}`);
console.log(`✅ Tradesmen photos table used: ${PHOTOS_TABLE}`);
