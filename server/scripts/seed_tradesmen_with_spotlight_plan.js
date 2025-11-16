#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed N tradesmen with realistic fields + precomputed VMB score/badge
 * AND create matching Spotlight purchases in payments_oneoff.
 *
 * Usage:
 *   node server/scripts/seed_tradesmen_with_spotlight_plan.js --count=10 --db=data/app.db
 *   node server/scripts/seed_tradesmen_with_spotlight_plan.js --count=10 --db=data/app.db --reset=true
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

const COUNT = Number.isFinite(Number(args.count)) ? Number(args.count) : 10;
const DB_PATH = args.db || process.env.DB_FILE || "server/db.sqlite";
const RESET_DB =
  args.reset === true ||
  args.reset === "true" ||
  args.reset === "1" ||
  args.reset === "";

// tables
const ONEOFF_TABLE = "payments_oneoff";
const PHOTOS_TABLE = "tradesmen_photos";

// --------- date helpers ----------

// ISO with T + ms + Z, e.g. 2025-12-14T13:02:02.334Z
const addDaysIso = (days) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

// SQL-style "YYYY-MM-DD HH:MM:SS", e.g. 2025-11-14 13:01:54 / 09:15:57
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

// --------- open / reset db ----------

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// OPTIONAL: nuke existing DB file when --reset=true
if (RESET_DB && fs.existsSync(DB_PATH)) {
  console.log(`⚠️  --reset specified, deleting existing DB: ${DB_PATH}`);
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);

// --------- helpers ----------
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const sample = (arr, k) => {
  const copy = [...arr];
  const out = [];
  while (out.length < k && copy.length) {
    out.push(copy.splice(rand(0, copy.length - 1), 1)[0]);
  }
  return out;
};
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// warranty / scoring identical to other script
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
    const a = WARRANTY_SCALE[i],
      b = WARRANTY_SCALE[i + 1];
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

const tblCols = (name) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${name})`)
      .all()
      .map((r) => r.name)
  );
const addColIfMissing = (tbl, colDef, colName) => {
  const cols = tblCols(tbl);
  if (!cols.has(colName))
    db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${colDef}`).run();
};

// Columns on tradesmen used by leaderboard/scoring + plans
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

// --------- payments_oneoff table ----------
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS ${ONEOFF_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id INTEGER,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_session_id TEXT,
    provider_payment_intent TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
  )
`
).run();

// --------- tradesmen_photos table ----------
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

// helper to avoid duplicate oneoff spotlight rows for same user
const hasSpotlightOneOffForUser = db.prepare(
  `
  SELECT 1 AS ok
  FROM ${ONEOFF_TABLE}
  WHERE user_id = ? AND type = 'spotlight'
  LIMIT 1
`
);

// photo URLs to attach
const PHOTO_URLS = [
  "/uploads/tradesmen/Kh3X1SrdPTWAWgk4ok4QaRzgKZg2_mhytaa95_6wb6gp.jpg",
  "/uploads/tradesmen/rKFv9p6OzkOdP3txRWUTlf9KoUV2_mhyv9s0w_km71xv.jpeg",
  "/uploads/tradesmen/rKFv9p6OzkOdP3txRWUTlf9KoUV2_mhyv9s0y_wd2q10.jpeg",
  "/uploads/tradesmen/rKFv9p6OzkOdP3txRWUTlf9KoUV2_mhyv9s0z_vparl3.jpeg",
];

// --------- seed data pools ----------
const TRADES = [
  "Plumber",
  "Electrician",
  "Carpenter",
  "Painter",
  "Roofer",
  "Bricklayer",
  "Tiler",
  "Handyman",
  "Heating Engineer",
  "Plasterer",
];
const AREAS = [
  "E4",
  "E17",
  "E10",
  "N17",
  "Walthamstow",
  "Chingford",
  "Leyton",
  "Hackney",
  "Islington",
  "Tottenham",
];
const FIRST = [
  "Alex",
  "Sam",
  "Jordan",
  "Taylor",
  "Morgan",
  "Casey",
  "Jamie",
  "Drew",
  "Riley",
  "Avery",
];
const LAST = [
  "Brown",
  "Smith",
  "Patel",
  "Jones",
  "Williams",
  "Khan",
  "Johnson",
  "Singh",
  "Wilson",
  "Davis",
];
const CO_SUFFIX = [
  "Lofts Ltd",
  "Services",
  "Builders",
  "Renovations",
  "HomeCare",
  "Solutions",
  "Contracts",
];

// --------- seed transaction ----------
const tx = db.transaction((n) => {
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

  const insertOneOff = db.prepare(`
    INSERT INTO ${ONEOFF_TABLE} (
      user_id,
      type,
      entity_id,
      amount,
      currency,
      status,
      provider_session_id,
      provider_payment_intent,
      expires_at,
      created_at
    )
    VALUES (
      @user_id,
      @type,
      @entity_id,
      @amount,
      @currency,
      @status,
      @provider_session_id,
      @provider_payment_intent,
      @expires_at,
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

  for (let i = 0; i < n; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const co = `${pick(TRADES)} ${pick(CO_SUFFIX)} ${rand(101, 999)}`;
    const company = co;
    const contact = `${first} ${last}`;
    const uid = `seed.spotlight.${slug(company)}.${rand(1000, 9999)}`;

    const trades = sample(TRADES, rand(2, 4)).join(",");
    const areas = sample(AREAS, rand(2, 5)).join(",");

    // simulate signals
    const photo_count = PHOTO_URLS.length; // 4 photos
    const offers_discount = [0, 0, rand(5, 15)][rand(0, 2)];
    const warranty_months = [0, 6, 12, 24, 36][rand(0, 4)];
    const supporting_doc_count = rand(1, 4);
    const likes_count = rand(0, 10);
    const wins_count = rand(0, 5);

    // CH + web
    const ch_status = "verified";
    const company_number = `${rand(10000000, 99999999)}`;
    const ch_name = company;
    const web_verified = 1;
    const domain = slug(company) + ".example.com";
    const web_url = `https://${domain}`;
    const social_links_json = "[]";

    const { score, badge } = computeScore({
      service_areas: areas,
      trade_types: trades,
      web_verified,
      ch_status,
      photo_count,
      offers_discount,
      warranty_months,
      supporting_doc_count,
    });

    const createdAt = nowSql();
    const updatedAt = createdAt;

    const subscription_status = "inactive"; // not a recurring plan
    const status = "active";
    const plan = "spotlight";
    const purchased_plan = "spotlight";

    upsertT.run({
      user_id: uid,
      company_name: company,
      contact_name: contact.toLowerCase(),
      phone: `07${rand(400000000, 499999999)}`,
      email: `${slug(contact)}@example.com`,
      trade_types: trades,
      service_areas: areas,
      created_at: createdAt,
      updated_at: updatedAt,
      subscription_status,
      contact_credits: 0,
      status,
      company_number,
      ch_status,
      ch_name,
      vmb_score: score,
      likes_count,
      wins_count,
      web_url,
      social_links_json,
      vmb_badge: badge,
      offers_discount,
      warranty_months,
      photo_count,
      web_verified,
      supporting_doc_count,
      plan,
      purchased_plan,
    });

    upsertRole.run({ uid });

    // Photos: clear and insert fixed 4 URLs
    deletePhotosForUser.run(uid);
    const photosCreatedAt = nowSql(); // e.g. 2025-11-14 09:15:57
    PHOTO_URLS.forEach((url, idx) => {
      insertPhoto.run({
        tradesman_user_id: uid,
        url,
        sort_order: idx + 1,
        created_at: photosCreatedAt,
      });
    });

    // One-off Spotlight payment
    const existing = hasSpotlightOneOffForUser.get(uid);
    if (!existing) {
      const createdAtOneoff = nowSql(); // 2025-11-14 13:01:54 style
      const expiresAt = addDaysIso(30); // 2025-12-14T13:02:02.334Z style
      const sessId = `sess_${rand(100000000000, 999999999999).toString(16)}`;

      insertOneOff.run({
        user_id: uid,
        type: "spotlight",
        entity_id: null,
        amount: 3999, // e.g. £39.99 in pence
        currency: "GBP",
        status: "active",
        provider_session_id: sessId,
        provider_payment_intent: null,
        expires_at: expiresAt,
        created_at: createdAtOneoff,
      });
    }
  }
});

tx(COUNT);

// --------- summary ----------
const row = db
  .prepare(`SELECT COUNT(*) AS c FROM tradesmen WHERE plan = 'spotlight'`)
  .get();
const top = db
  .prepare(
    `
  SELECT company_name, vmb_score, vmb_badge, plan, subscription_status
  FROM tradesmen
  WHERE plan = 'spotlight'
  ORDER BY vmb_score DESC, updated_at DESC
  LIMIT 5
`
  )
  .all();

console.log(`✅ Seeded ${COUNT} spotlight tradesmen into ${DB_PATH}`);
console.log(`Total spotlight tradesmen now: ${row.c}`);
console.log("Top 5 spotlight by score:");
for (const r of top) {
  console.log(
    ` - ${r.company_name} → ${r.vmb_score} (${r.vmb_badge}) [plan=${r.plan}, status=${r.subscription_status}]`
  );
}
console.log(`✅ One-off payments table used: ${ONEOFF_TABLE}`);
console.log(`✅ Tradesmen photos table used: ${PHOTOS_TABLE}`);
