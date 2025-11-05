#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed N tradesmen with realistic fields + precomputed VMB score/badge.
 * Usage:
 *   node server/scripts/seed_tradesmen.js --count=10 --db=server/db.sqlite
 *
 * Notes:
 * - No external deps; uses better-sqlite3 (already in your server).
 * - Generates varied trades/areas/photos/docs/discount/warranty and some CH + web flags.
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// --------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const COUNT = Number.isFinite(Number(args.count)) ? Number(args.count) : 10;
const DB_PATH = args.db || process.env.DB_FILE || "server/db.sqlite";

// --------- open db ----------
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
const db = new Database(DB_PATH);

// --------- helpers ----------
const nowIso = () => new Date().toISOString();
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

// warranty scale identical to the route logic
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

// identical weights to the route
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
  const hasDiscount = parseInt(row.offers_discount || 0, 10) > 0; // accepts 1 or %
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
    contact_name TEXT, phone TEXT, email TEXT,
    trade_types TEXT DEFAULT '', service_areas TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    subscription_status TEXT DEFAULT 'free',
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

// columns used by leaderboard/scoring
addColIfMissing("tradesmen", "vmb_score INTEGER DEFAULT 0", "vmb_score");
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
  "Ltd",
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
      user_id, company_name, contact_name, phone, email,
      trade_types, service_areas,
      web_verified, web_url, social_links_json,
      company_number, ch_status,
      photo_count, offers_discount, warranty_months, supporting_doc_count,
      vmb_score, vmb_badge, updated_at
    )
    VALUES (
      @user_id, @company_name, @contact_name, @phone, @email,
      @trade_types, @service_areas,
      @web_verified, @web_url, @social_links_json,
      @company_number, @ch_status,
      @photo_count, @offers_discount, @warranty_months, @supporting_doc_count,
      @vmb_score, @vmb_badge, @updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      company_name=excluded.company_name,
      contact_name=excluded.contact_name,
      phone=excluded.phone,
      email=excluded.email,
      trade_types=excluded.trade_types,
      service_areas=excluded.service_areas,
      web_verified=excluded.web_verified,
      web_url=excluded.web_url,
      social_links_json=excluded.social_links_json,
      company_number=excluded.company_number,
      ch_status=excluded.ch_status,
      photo_count=excluded.photo_count,
      offers_discount=excluded.offers_discount,
      warranty_months=excluded.warranty_months,
      supporting_doc_count=excluded.supporting_doc_count,
      vmb_score=excluded.vmb_score,
      vmb_badge=excluded.vmb_badge,
      updated_at=excluded.updated_at
  `);

  const upsertRole = db.prepare(`
    INSERT INTO user_roles (uid, role) VALUES (@uid, 'tradesman')
    ON CONFLICT(uid) DO UPDATE SET role='tradesman'
  `);

  for (let i = 0; i < n; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const co = `${pick(TRADES)} ${pick(CO_SUFFIX)} ${rand(101, 999)}`;
    const company = co;
    const contact = `${first} ${last}`;
    const uid = `seed.vendor.${slug(company)}.${rand(1000, 9999)}`;

    const trades = sample(TRADES, rand(2, 4)).join(", ");
    const areas = sample(AREAS, rand(2, 5)).join(", ");

    // simulate signals
    const photo_count = rand(0, 6);
    const offers_discount = [0, 0, 0, rand(5, 15)][rand(0, 3)]; // skew towards 0
    const warranty_months = [0, 6, 12, 24, 36][rand(0, 4)];
    const supporting_doc_count = rand(0, 4);

    // some verified CH + web presence
    const ch_status = ["verified", "ambiguous", "no_match", null][rand(0, 3)];
    const company_number =
      ch_status === "verified" ? `0${rand(1000000, 9999999)}` : null;
    const web_verified = [1, 0, 0, 1, 0][rand(0, 4)]; // ~40% verified

    const domain = slug(company) + ".example.com";
    const web_url = web_verified ? `https://${domain}` : null;
    const social_links_json = "[]";

    // compute score
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

    upsertT.run({
      user_id: uid,
      company_name: company,
      contact_name: contact,
      phone: `07${rand(400000000, 499999999)}`,
      email: `${slug(contact)}@example.com`,
      trade_types: trades,
      service_areas: areas,
      web_verified,
      web_url,
      social_links_json,
      company_number,
      ch_status,
      photo_count,
      offers_discount,
      warranty_months,
      supporting_doc_count,
      vmb_score: score,
      vmb_badge: badge,
      updated_at: nowIso(),
    });

    upsertRole.run({ uid });
  }
});

tx(COUNT);

// --------- summary ----------
const row = db.prepare(`SELECT COUNT(*) AS c FROM tradesmen`).get();
const top = db
  .prepare(
    `
  SELECT company_name, vmb_score, vmb_badge
  FROM tradesmen
  ORDER BY vmb_score DESC, updated_at DESC
  LIMIT 5
`
  )
  .all();

console.log(`✅ Seeded ${COUNT} tradesmen into ${DB_PATH}`);
console.log(`Total tradesmen now: ${row.c}`);
console.log(`Top 5 by score:`);
for (const r of top) {
  console.log(` - ${r.company_name} → ${r.vmb_score} (${r.vmb_badge})`);
}
