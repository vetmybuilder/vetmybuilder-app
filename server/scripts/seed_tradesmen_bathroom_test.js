#!/usr/bin/env node
/**
 * Seed 5 tradesmen for Featured-project matching tests into MySQL:
 * 4 Bathroom trades, 1 External Wall Insulation.
 */

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

const mysql = require("mysql2/promise");
const { logger } = require("../lib/logger");

const TAG = "[seed_tradesmen_bathroom_test]";

// --------- MySQL config ----------
const {
  MYSQL_HOST = "127.0.0.1",
  MYSQL_PORT = "3306",
  MYSQL_USER = "root",
  MYSQL_PASSWORD = "",
  MYSQL_DATABASE = "vetmybuilder",
} = process.env;

// --------- date helper ----------
const nowSql = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

// --------- helpers ----------
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// scoring helpers – unchanged
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

const SUBS_TABLE = "payments_subscription";
const PHOTOS_TABLE = "tradesmen_photos";

const PHOTO_URLS = [
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7urz_p20wpp.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7urz_syd9mx.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7us0_4nzmfg.jpeg",
  "/uploads/tradesmen/sOQIrKJm1cYzWhENwlND8GzOAKn1_mhyn7us0_snwu07.jpeg",
];

// 4 Bathroom, 1 External Wall
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

async function main() {
  logger.info(
    {
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      database: MYSQL_DATABASE,
    },
    `${TAG} connecting to MySQL`
  );

  const conn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  });

  logger.info(`${TAG} connected to MySQL`);

  // Ensure minimal tables exist
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_roles (
      uid VARCHAR(255) PRIMARY KEY,
      role VARCHAR(50) NOT NULL DEFAULT 'user'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ${SUBS_TABLE} (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      buyer_uid VARCHAR(255) NOT NULL,
      plan_id VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      currency VARCHAR(10) NOT NULL,
      status VARCHAR(50) NOT NULL,
      provider_session_id VARCHAR(255),
      provider_customer_id VARCHAR(255),
      provider_subscription_id VARCHAR(255),
      provider_payment_intent VARCHAR(255),
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ${PHOTOS_TABLE} (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tradesman_user_id VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      sort_order INT,
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const hasGoldSubForUser = async (uid) => {
    const [rows] = await conn.execute(
      `
      SELECT 1 FROM ${SUBS_TABLE}
      WHERE buyer_uid = ? AND plan_id = 'gold'
      LIMIT 1
    `,
      [uid]
    );
    return rows.length > 0;
  };

  try {
    await conn.beginTransaction();

    for (let i = 0; i < FIXTURES.length; i++) {
      const f = FIXTURES[i];
      const uid = `seed.bathroomtest.${slug(f.key)}`;

      const createdAt = nowSql();
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
      const domain = `${slug(f.company)}.example.com`;
      const socials = JSON.stringify([
        `https://instagram.com/${slug(f.company)}`,
        `https://facebook.com/${slug(f.company)}`,
      ]);

      await conn.execute(
        `
        INSERT INTO tradesmen
        (user_id, company_name, contact_name, phone, email, trade_types, service_areas,
         created_at, updated_at, subscription_status, contact_credits, status,
         company_number, ch_status, ch_name, vmb_score, likes_count, wins_count, web_url,
         social_links_json, vmb_badge, offers_discount, warranty_months, photo_count, web_verified,
         supporting_doc_count, plan, purchased_plan)
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
          f.company,
          "test contact",
          "0208 000 0000",
          `info@${domain}`,
          f.trade_types,
          f.service_areas,
          createdAt,
          createdAt,
          "active",
          0,
          "active",
          String(60000000 + i),
          "verified",
          f.company,
          score,
          0,
          0,
          `https://${domain}`,
          socials,
          badge,
          base.offers_discount,
          base.warranty_months,
          base.photo_count,
          base.web_verified,
          base.supporting_doc_count,
          "gold",
          "gold",
        ]
      );

      await conn.execute(
        `INSERT INTO user_roles (uid, role)
         VALUES (?, 'tradesman')
         ON DUPLICATE KEY UPDATE role='tradesman'`,
        [uid]
      );

      // Photos
      await conn.execute(
        `DELETE FROM ${PHOTOS_TABLE} WHERE tradesman_user_id = ?`,
        [uid]
      );
      const createdPhotosAt = nowSql();

      for (let p = 0; p < PHOTO_URLS.length; p++) {
        await conn.execute(
          `
          INSERT INTO ${PHOTOS_TABLE} (tradesman_user_id, url, sort_order, created_at)
          VALUES (?, ?, ?, ?)
          `,
          [uid, PHOTO_URLS[p], p + 1, createdPhotosAt]
        );
      }

      // Gold subscription
      if (!(await hasGoldSubForUser(uid))) {
        const createdSubAt = nowSql();
        const sessId = `sess_${(600000000000 + i).toString(16)}`;
        await conn.execute(
          `
          INSERT INTO ${SUBS_TABLE}
          (buyer_uid, plan_id, amount, currency, status,
           provider_session_id, provider_payment_intent, created_at)
          VALUES (?, 'gold', 2900, 'GBP', 'succeeded', ?, ?, ?)
        `,
          [uid, sessId, `mock:${sessId}`, createdSubAt]
        );
      }
    }

    await conn.commit();

    const [seeded] = await conn.execute(`
      SELECT user_id, company_name, trade_types, vmb_score
      FROM tradesmen
      WHERE user_id LIKE 'seed.bathroomtest.%'
      ORDER BY company_name
    `);

    logger.info(
      {
        count: seeded.length,
        tableSubs: SUBS_TABLE,
        tablePhotos: PHOTOS_TABLE,
      },
      `${TAG} seeded bathroom-test tradesmen`
    );

    seeded.forEach((r) => {
      logger.info(
        {
          uid: r.user_id,
          company: r.company_name,
          trades: r.trade_types,
          score: r.vmb_score,
        },
        `${TAG} seeded row`
      );
    });
  } catch (err) {
    await conn.rollback();
    logger.error({ error: err?.message }, `${TAG} failed transaction`);
    process.exit(1);
  } finally {
    await conn.end();
    logger.info(`${TAG} connection closed`);
  }
}

main().catch((err) => {
  logger.error({ error: err?.message }, `${TAG} fatal script error`);
  process.exit(1);
});
