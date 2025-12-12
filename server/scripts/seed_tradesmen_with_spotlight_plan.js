#!/usr/bin/env node
/**
 * Seed N tradesmen with realistic fields + precomputed VMB score/badge
 * AND create matching Spotlight purchases in payments_oneoff.
 */

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

const mysql = require("mysql2/promise");
const { logger } = require("../lib/logger");

const TAG = "[seed_spotlight]";

// --------- config / args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const COUNT = Number.isFinite(Number(args.count)) ? Number(args.count) : 10;

const ONEOFF_TABLE = "payments_oneoff";
const PHOTOS_TABLE = "tradesmen_photos";

// --------- date helpers ----------
const addDaysIso = (days) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const nowSql = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

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

// warranty + scoring logic (same as gold)
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

  score = Math.max(0, Math.min(100, score));

  return { score, badge: toBadge(score) };
}

// photos
const PHOTO_URLS = [
  "/uploads/tradesmen/Kh3X1SrdPTWAWgk4ok4QaRzgKZg2_mhytaa95_6wb6gp.jpg",
  "/uploads/tradesmen/rKFv9p6OzkOdP3txRWUTlf9KoUV2_mhyv9s0w_km71xv.jpeg",
  "/uploads/tradesmen/rKFv9p6OzkOdP3txRWUTlf9KoUV2_mhyv9s0y_wd2q10.jpeg",
  "/uploads/tradesmen/rKFv9p6OzkOdP3txRWUTlf9KoUV2_mhyv9s0z_vparl3.jpeg",
];

// seed pools
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

async function main() {
  const dbName = process.env.MYSQL_DATABASE || "vetmybuilder";

  logger.info({ count: COUNT, dbName }, `${TAG} starting seed`);

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: dbName,
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
      const uid = `seed.spotlight.${slug(company)}.${rand(1000, 9999)}`;

      const trades = sample(TRADES, rand(2, 4)).join(",");
      const areas = sample(AREAS, rand(2, 5)).join(",");

      const photo_count = PHOTO_URLS.length;
      const offers_discount = [0, 0, rand(5, 15)][rand(0, 2)];
      const warranty_months = [0, 6, 12, 24, 36][rand(0, 4)];
      const supporting_doc_count = rand(1, 4);
      const likes_count = rand(0, 10);
      const wins_count = rand(0, 5);

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

      const now = nowSql();

      // upsert tradesman
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
          company_name = VALUES(company_name),
          trade_types = VALUES(trade_types),
          service_areas = VALUES(service_areas),
          updated_at = VALUES(updated_at),
          vmb_score = VALUES(vmb_score),
          vmb_badge = VALUES(vmb_badge)
        `,
        [
          uid,
          company,
          contact,
          `07${rand(400000000, 499999999)}`,
          `${slug(contact)}@example.com`,
          trades,
          areas,
          now,
          now,
          "inactive",
          0,
          "active",
          company_number,
          ch_status,
          ch_name,
          score,
          likes_count,
          wins_count,
          web_url,
          social_links_json,
          badge,
          offers_discount,
          warranty_months,
          photo_count,
          web_verified,
          supporting_doc_count,
          "spotlight",
          "spotlight",
        ]
      );

      // upsert user role
      await connection.execute(
        `
        INSERT INTO user_roles (uid, role)
        VALUES (?, 'tradesman')
        ON DUPLICATE KEY UPDATE role='tradesman'
        `,
        [uid]
      );

      // photos
      await connection.execute(
        `DELETE FROM ${PHOTOS_TABLE} WHERE tradesman_user_id = ?`,
        [uid]
      );

      for (let p = 0; p < PHOTO_URLS.length; p++) {
        await connection.execute(
          `
          INSERT INTO ${PHOTOS_TABLE} (tradesman_user_id, url, sort_order, created_at)
          VALUES (?, ?, ?, ?)
          `,
          [uid, PHOTO_URLS[p], p + 1, now]
        );
      }

      // spotlight one-off payment
      const [existing] = await connection.execute(
        `
        SELECT 1 FROM ${ONEOFF_TABLE}
        WHERE user_id = ? AND type='spotlight'
        LIMIT 1
        `,
        [uid]
      );

      if (!existing.length) {
        const expiresAt = addDaysIso(30);
        const sessId = `sess_${rand(100000000000, 999999999999).toString(16)}`;

        await connection.execute(
          `
          INSERT INTO ${ONEOFF_TABLE} (
            user_id, type, entity_id, amount, currency, status,
            provider_session_id, provider_payment_intent,
            expires_at, created_at
          )
          VALUES (?, 'spotlight', NULL, 3999, 'GBP', 'active',
                  ?, NULL, ?, ?)
          `,
          [uid, sessId, expiresAt, now]
        );
      }
    }

    await connection.commit();

    const [[countRow]] = await connection.execute(
      `SELECT COUNT(*) AS c FROM tradesmen WHERE plan='spotlight'`
    );

    const [top] = await connection.execute(
      `
      SELECT company_name, vmb_score, vmb_badge
      FROM tradesmen
      WHERE plan='spotlight'
      ORDER BY vmb_score DESC
      LIMIT 5
      `
    );

    logger.info(
      {
        seeded: COUNT,
        totalSpotlight: countRow.c,
        top5: top,
        oneoffTable: ONEOFF_TABLE,
        photosTable: PHOTOS_TABLE,
      },
      `${TAG} spotlight seed completed`
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
