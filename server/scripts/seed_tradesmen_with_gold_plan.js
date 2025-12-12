#!/usr/bin/env node
/**
 * Seed N tradesmen with realistic fields + precomputed VMB score/badge
 * AND create matching Gold subscriptions in payments_subscription (MySQL).
 *
 * Usage:
 *   node server/scripts/seed_tradesmen_with_gold_plan.js --count=10
 */

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

const mysql = require("mysql2/promise");
const { logger } = require("../lib/logger");

const TAG = "[seed_tradesmen_with_gold_plan]";

// --------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const COUNT = Number.isFinite(Number(args.count)) ? Number(args.count) : 10;
const DB_NAME = args.db || process.env.MYSQL_DATABASE || "vetmybuilder";

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
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const nowSql = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

// warranty/scoring (same formulas)
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

  const photos = Number(row.photo_count || 0);
  const hasDiscount = Number(row.offers_discount || 0) > 0;
  const wPts = lerpWarranty(row.warranty_months);

  const chOK = String(row.ch_status || "").toLowerCase() === "verified";
  const webOK = Number(row.web_verified || 0) === 1;

  let score =
    (areas.length >= 3 ? WEIGHTS.serviceAreasMin3 : 0) +
    (webOK ? WEIGHTS.webPresenceAny : 0) +
    (chOK ? WEIGHTS.chVerified : 0) +
    (trades.length >= 3 ? WEIGHTS.tradesMin3 : 0) +
    (photos >= 3 ? WEIGHTS.photosMin3 : 0) +
    (hasDiscount ? WEIGHTS.discountAny : 0) +
    Math.min(wPts, WEIGHTS.warrantyMax) +
    (Number(row.supporting_doc_count || 0) >= 2 ? WEIGHTS.docsMin2 : 0);

  return {
    score: Math.max(0, Math.min(100, score)),
    badge: toBadge(score),
  };
}

// test photo URLs
const PHOTO_URLS = [
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7urz_p20wpp.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7urz_syd9mx.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7us0_4nzmfg.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7us0_snwu07.jpeg",
];

// pools for generating realistic test data
const TRADES = [
  "External Wall Insulation",
  "Internal Wall Insulation",
  "Loft Insulation",
  "Roof Insulation",
  "Roofer",
  "Plumber",
  "Electrician",
  "Carpenter",
  "Painter",
  "Plasterer",
];
const AREAS = ["E4", "E5", "E10", "E17", "E20", "N17", "Walthamstow", "Chingford", "Leyton", "Hackney"];
const FIRST = ["Mike", "Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Jamie", "Riley", "Avery"];
const LAST = ["Morrison", "Brown", "Smith", "Patel", "Jones", "Williams", "Khan", "Johnson", "Singh", "Wilson"];
const CO_SUFFIX = ["Ltd", "Lofts Ltd", "Builders", "Renovations", "HomeCare", "Solutions", "Contracts"];

async function main() {
  logger.info({ count: COUNT, db: DB_NAME }, `${TAG} starting seed`);

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: DB_NAME,
    multipleStatements: true,
  });

  logger.info(`${TAG} connected to MySQL`);

  try {
    await connection.beginTransaction();

    for (let i = 0; i < COUNT; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      const company = `${pick(TRADES)} ${pick(CO_SUFFIX)} ${rand(101, 999)}`;
      const contact = `${first} ${last}`;
      const uid = `seed.gold.${slug(company)}.${rand(1000, 9999)}`;

      const trades = sample(TRADES, rand(3, 5)).join(",");
      const areas = sample(AREAS, rand(3, 5)).join(",");

      const photo_count = PHOTO_URLS.length;
      const offers_discount = rand(5, 15);
      const warranty_months = [6, 12, 24, 36][rand(0, 3)];
      const supporting_doc_count = rand(2, 4);
      const likes_count = rand(0, 20);
      const wins_count = rand(0, 10);

      const ch_status = "verified";
      const company_number = `${rand(10000000, 99999999)}`;
      const ch_name = company;
      const web_verified = 1;

      const domain = slug(company) + ".example.com";
      const web_url = `https://${domain}`;
      const socials = JSON.stringify([
        `https://instagram.com/${slug(company)}`,
        `https://facebook.com/${slug(company)}`,
      ]);

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

      await connection.execute(
        `
        INSERT INTO tradesmen (
          user_id, company_name, contact_name, phone, email, trade_types,
          service_areas, created_at, updated_at, subscription_status,
          contact_credits, status, company_number, ch_status, ch_name,
          vmb_score, likes_count, wins_count, web_url, social_links_json,
          vmb_badge, offers_discount, warranty_months, photo_count,
          web_verified, supporting_doc_count, plan, purchased_plan
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          company_name=VALUES(company_name),
          trade_types=VALUES(trade_types),
          service_areas=VALUES(service_areas),
          updated_at=VALUES(updated_at),
          vmb_score=VALUES(vmb_score),
          vmb_badge=VALUES(vmb_badge),
          web_verified=VALUES(web_verified)
        `,
        [
          uid,
          company,
          contact,
          `020 8${rand(100, 999)} ${rand(1000, 9999)}`,
          `info@${domain}`,
          trades,
          areas,
          createdAt,
          createdAt,
          "active",
          0,
          "active",
          company_number,
          ch_status,
          ch_name,
          score,
          likes_count,
          wins_count,
          web_url,
          socials,
          badge,
          offers_discount,
          warranty_months,
          photo_count,
          web_verified,
          supporting_doc_count,
          "gold",
          "gold",
        ]
      );

      await connection.execute(
        `INSERT INTO user_roles (uid, role)
         VALUES (?, 'tradesman')
         ON DUPLICATE KEY UPDATE role='tradesman'`,
        [uid]
      );

      await connection.execute(
        `DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`,
        [uid]
      );

      const photosCreatedAt = nowSql();
      let sort = 1;
      for (const url of PHOTO_URLS) {
        await connection.execute(
          `
          INSERT INTO tradesmen_photos (tradesman_user_id, url, sort_order, created_at)
          VALUES (?, ?, ?, ?)
          `,
          [uid, url, sort++, photosCreatedAt]
        );
      }

      const [existing] = await connection.execute(
        `
        SELECT 1 FROM payments_subscription
        WHERE buyer_uid = ? AND plan_id='gold' LIMIT 1
        `,
        [uid]
      );

      if (!existing.length) {
        const createdSubAt = nowSql();
        const sessId = `sess_${rand(100000000000, 999999999999).toString(16)}`;

        await connection.execute(
          `
          INSERT INTO payments_subscription (
            buyer_uid, plan_id, amount, currency, status,
            provider_session_id, provider_customer_id,
            provider_subscription_id, provider_payment_intent, created_at
          )
          VALUES (?, 'gold', 2900, 'GBP', 'succeeded',
                  ?, NULL, NULL, ?, ?)
          `,
          [uid, sessId, `mock:${sessId}`, createdSubAt]
        );
      }
    }

    await connection.commit();

    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS c FROM tradesmen WHERE plan='gold'`
    );
    const totalGold = countRows[0].c;

    const [topRows] = await connection.execute(
      `
      SELECT company_name, vmb_score, vmb_badge, plan
      FROM tradesmen
      WHERE plan='gold'
      ORDER BY vmb_score DESC
      LIMIT 5
      `
    );

    logger.info(
      { seeded: COUNT, total: totalGold, top: topRows },
      `${TAG} seed completed`
    );
  } catch (err) {
    await connection.rollback();
    logger.error({ error: err?.message }, `${TAG} failed, rollback`);
    process.exit(1);
  } finally {
    await connection.end();
    logger.info(`${TAG} connection closed`);
  }
}

main().catch((err) => {
  logger.error({ error: err?.message }, `${TAG} fatal script error`);
  process.exit(1);
});